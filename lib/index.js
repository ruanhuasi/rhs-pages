const { src, dest, parallel, series, watch } = require('gulp')

const del = require('del')

const browserSync = require('browser-sync')

const bs = browserSync.create()

const loadPlugins = require('gulp-load-plugins')

const plugins = loadPlugins()

 
// 返回当前命令行所在的工作目录
const cwd = process.cwd()

let config = {
  // default config
  build: {
    src: 'src',
    dist: 'dist',
    temp: 'temp',
    public: 'public',
    paths: {
      styles: 'assets/styles/*.scss',
      scripts: 'assets/scripts/*.js',
      pages: '*.html',
      images: 'assets/images/**',
      fonts: 'assets/fonts/**',
    }
  }
}

const clean = () => {
  return del([config.build.dist, config.build.temp])
}

// 尝试读取配置文件（也有可能读取不到）
try {
  const loadConfig = require(`${cwd}/pages.config.js`)
  config = Object.assign({}, config, loadConfig)
} catch (e) {}

const style = () => {
  // 为了不让原来的目录结构丢失，src可以指定一个选项参数 base，转换时的基准路径，让'src'后面的目录结构都保存下来
  // cwd 参数指定 从指定的 src 位置读取
  return src(config.build.paths.styles, { base: config.build.src, cwd: config.build.src })
    .pipe(plugins.sass({ outputStyle: 'expanded' })) // 指定css样式结束括号的位置
    .pipe(dest(config.build.temp))
    .pipe(bs.reload({ stream: true }))
}

const script = () => {
  return (
    src(config.build.paths.scripts, { base: config.build.src, cwd: config.build.src })
      // presets 指定 babel 指定转换插件
      .pipe(plugins.babel({ presets: [require('@babel/preset-env')] }))
      .pipe(dest(config.build.temp))
      .pipe(bs.reload({ stream: true }))
  )
}

const page = () => {
  // **/* 通配符匹配 src 任意子目录下的 html 文件
  return (
    src(config.build.paths.pages, { base: config.build.src, cwd: config.build.src })
      // data 指定传入模板的数据
      .pipe(plugins.swig({ data: config.data, defaults: { cache: false } }))
      .pipe(dest(config.build.temp))
      .pipe(bs.reload({ stream: true }))
  )
}

const image = () => {
  return src(config.build.paths.images, { base: config.build.src, cwd: config.build.src })
    .pipe(plugins.imagemin())
    .pipe(dest(config.build.dist))
}

const font = () => {
  return src(config.build.paths.fonts, { base: config.build.src, cwd: config.build.src })
    .pipe(plugins.imagemin())
    .pipe(dest(config.build.dist))
}

const extra = () => {
  return src('**', { base: config.build.public, cwd: config.build.public }).pipe(dest(config.build.dist))
}

const server = () => {
  /**
   * 通过 gulp 的 watch 监听以下目录的变化来实现热更新
   *
   */
  watch(config.build.paths.styles,{ cwd: config.build.src }, style)
  watch(config.build.paths.scripts,{ cwd: config.build.src }, script)
  watch(config.build.paths.pages,{ cwd: config.build.src }, page) // 模板引擎swig的热更新需要将 cache 设为 false
  /**
   * 对于图片、字体、一些额外文件在开发阶段编译没有太大意义，
   * 例如：图片实现的是无损压缩，并不影响最终在页面中的呈现，
   * 这就意味着，在开发阶段去监视更多的文件，做更多的任务，开销也就更多，
   * 而这个开销在开发阶段是没有意义的，只是在发布之前上线之前希望通过压缩一下，来减小一下上线的体积，从而提高网站运行的效率，
   * watch('src/assets/images/**',image)
   * watch('src/assets/fonts/**',font)
   * watch('public/**',extra)
   */
  // 所以我们通过监听这类文件的变化，自动更新浏览器，浏览器重新发起对这些文件的请求，而不是执行构建任务
  watch([config.build.paths.images, config.build.paths.fonts],{ cwd: config.build.src }, bs.reload)

  watch('**',{ cwd: config.build.public }, bs.reload)

  bs.init({
    notify: false, // 不弹出提示browserSync是否已连接
    port: '2080', // 配置端口
    // open: false,// 是否自动打开浏览器
    /** files
     * browserSync 启动后监听的路径通配符（你想要哪些文件发生改变过后，browserSync 自动更新浏览器）
     * 也可以通过在对应的构建任务后面加上 .pipe(bs.reload({ stream: true })) 的方式实现监听
     */
    // files: 'dist/**',
    server: {
      // baseDir 可以传入一个数组，依次匹配，例如：如果在dist文件中匹配不到就匹配src，src匹配不到就匹配 public
      // 这么做的目的就是像压缩图片这一类任务是在发布上线之前执行的，那么图片就不能在dist文件中匹配到
      baseDir: [config.build.temp, config.build.dist, config.build.public],
      routes: {
        // 指定单独的路由，匹配优先于 baseDir，
        '/node_modules': 'node_modules' // 这里先用这种办法指定库文件
      }
    }
  })
}

// 根据构建注释引用的资源全部合并到同一个文件当中
const useref = () => {
  return (
    src(config.build.paths.pages, { base: config.build.temp, cwd: config.build.src })
      .pipe(plugins.useref({ searchPath: [config.build.temp, '.'] }))
      // html js css 有三种不同类型的文件，需要对他们分别作不同的操作
      // pipe 转换流刘根据 if 指定的条件，去决定是否要去执行具体的转换流
      .pipe(plugins.if(/\.js$/, plugins.uglify())) // js
      .pipe(plugins.if(/\.css$/, plugins.cleanCss())) // css
      // html collapseWhitespace: true 折叠所有的空白字符
      // minifyCSS、minifyJS 折叠页面当中的style和script标签中内部的脚本
      .pipe(
        plugins.if(
          /\.html$/,
          plugins.htmlmin({
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true
          })
        )
      )
      .pipe(dest(config.build.dist))
  )
}

const compiple = parallel(style, script, page)
// 上线之前执行的任务
const build = series(
  clean,
  parallel(series(compiple, useref), image, font, extra)
)

const develop = series(compiple, server)

module.exports = {
  build,
  server,
  develop,
  useref
}
