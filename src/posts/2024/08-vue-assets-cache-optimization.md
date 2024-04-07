# Vue 前端资源本地缓存优化
## 问题描述
大家在开发微信公众号、微信小程序里的 H5 网页（包括但不仅限于此，PC 端浏览器的缓存问题一样是有的）时，经常会遇到缓存问题，一个特别典型的场景就是前端把改好的代码打包更新到服务器上后，项目经理测试，发现还是跟更新之前一样，并没有看到最新的效果。但开发可能会说，我自己测试是好的呀，你去清理一下微信的缓存嘛……

上面这种情况可以说屡见不鲜，快成为我们的一个老大难问题了。这里面固然有微信内置浏览器（Android 版微信内置浏览器用的是腾讯自研的 X5 内核，没用系统 WebView，iOS 版微信则使用的是系统 WKWebView）的锅，所以各种清微信缓存的方法也派上用场了，比如微信账号退出登录、取关公众号再重新关注公众号、删掉小程序再重新搜索发现小程序、微信设置里清除缓存数据、手机应用设置里找到微信再清除它的缓存数据等等，但是否生效其实挺玄乎的（可能还会误删聊天记录缓存），有些操作对于普通用户来说操作成本也实在是太高。所以，我们更需要考虑的是，怎样从技术层面优化或解决这个问题？

## 解决方案
基本上我们所有的前端项目，现在都用 Docker 来构建了，因此可以使用 Docker 和 Nginx 进行构建和配置，来优化缓存问题。我们会选择 nginx:stable-alpine 镜像作为基础镜像，然后将前端 npm build 打包出来的文件（也就是 dist 文件夹下的 index.html 和 static 文件夹，存放在 Dockerfile 文件所在目录能访问到的路径下，如 Dockerfile 文件同级的路径或其他路径），COPY 到容器里面的固定路径，通常是 COPY 到容器里面存放静态页面文件的 /usr/share/nginx/html 目录下。然后，我们配置下 nginx 容器里的 default.conf 文件，对 $request_filename 的值进行判断，如果以 .html 或 .htm 结尾，就加上不缓存的响应头，也就是 Cache-Control。

所以这种方案，我们需要修改一下 Dockerfile 文件，以及新增一份 default.conf 文件（当然，如果原本就有 default.conf 文件，就只需修改下内容即可），目的是为了将自定义的这一份 default.conf 文件（该文件位于当前的构建上下文里），拷贝到容器里，覆盖里面的同名文件，以便能进行我们的判断逻辑，也就是上面说的对 $request_filename 的值进行判断的逻辑。

要特别说明的是，这个方案用到了 nginx 的 try_files 指令，同时配合 root 指令，才能确保 $request_filename 的值是一个确定的值，是一个在容器里面确定存在的文件。关于 try_files 指令的用法，大家自行百度。

下面是 Dockerfile 和 default.conf 的内容——
``` 
# 使用 nginx 稳定版作为基础镜像
FROM nginx:stable-alpine
# 设置时区为上海，解决时间不一致的问题
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo 'Asia/Shanghai' > /etc/timezone
# 将构建好的 dist 文件夹（包含前端资源）复制到 nginx 的静态资源目录
COPY dist /usr/share/nginx/html
# 将自定义的 nginx 配置文件复制到容器中，覆盖默认配置
COPY default.conf /etc/nginx/conf.d/default.conf
```

``` 
server {
    # 这个是容器内部的端口，通常会通过 sh 脚本，或者直接运行 docker run -p 命令，将容器内端口映射到宿主机上的某个端口
    listen 8202;
    server_name localhost;
    location / {
        # 根目录指向存放前端静态资源的路径
        root /usr/share/nginx/html;
        # 尝试直接访问请求的文件或目录，如果失败则重定向到 index.html
        try_files $uri $uri/ /index.html;
        # 针对 HTML 文件设置不缓存的响应头，确保更新后的内容能被立即请求到
        if ($request_filename ~* .*\.(html|htm)$) {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }
    # 配置错误页面
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

可以在配置前，先请求一下页面，在开发者工具的请求列表里查看 HTML 页面和 JS、CSS 文件的响应头。然后在配置之后，刷新页面，再看一下 HTML 页面和 JS、CSS 文件的响应头，应该能看到文档类型的请求，已经可以返回 **Cache-Control: no-cache, no-store, must-revalidate** 响应头了，而由这个 index.html 页面加载的 JS、CSS 则可以正常被浏览器缓存起来。
 
## 方案的优缺点
**优点：**

1. **立即生效**：通过设置 html 或 htm 文件的 `Cache-Control` 为 `no-cache, no-store, must-revalidate`，可以确保每次访问入口页面文件都会获取最新的内容，避免了缓存导致的问题。
2. **自动化部署友好**：把 Dockerfile 和自定义的 Nginx 配置文件放在源码里进行版本化管理，方便进行 CI/CD 操作，提高开发和部署效率。
3. **灵活性高**：通过 Nginx 的配置文件，可以灵活地对不同类型的前端资源进行不同的缓存策略处理。
4. **跨平台兼容**：适用于各种浏览器和微信内置浏览器，提高了项目的兼容性。

**缺点：**

1. **性能考虑**：对所有 HTML 文件禁用缓存可能会增加服务器的负载（不过 HTML 文件也可以放到 CDN 上，或者 Nginx 自己的缓存里），因为每次访问都需要重新加载资源，对于大型或访问量大的应用，需要权衡缓存策略和服务器负载。
2. **配置复杂度**：需要对 Nginx 进行定制化配置，对于不熟悉 Nginx 的同学来说，学习和配置成本相对较高。
3. **缓存策略的局限性**：虽然可以解决 HTML 文件的缓存问题，但对于 JS、CSS 等静态资源的版本管理和缓存优化还需要额外的策略，如文件指纹（hash）等。

因此，对于生产环境来说，还是建议综合考虑一下性能和缓存策略，可以结合更多的技术，如 CDN、资源版本控制等，来优化用户的访问速度和体验。