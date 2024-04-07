# 部署与使用 Squid 正向代理

## 背景

在医院项目中，由于安全性和其他网络策略的考虑，经常会遇到某些服务器无法直接访问公网的情况。而 Nginx 服务器，因为充当了公网用户和后端服务器之间的媒介（反向代理），是可以与公网进行通信的。为了克服这种局限性，使得相关的服务器（如应用服务器）能访问到互联网，我们一般会引入正向代理的解决方案，也就是在 Nginx 服务器上安装其他透明的正向代理软件，以避免业务上出现异常。

有人可能会问，为什么不直接用 Nginx 服务器上的 Nginx 进行正向代理呢？其实，<mark>Nginx 做 HTTP 的正向代理是完全没问题的</mark>，配置起来也非常简单。只是，**<mark>它不能很好地支持 HTTPS 请求的正向代理</mark>**。

这里展开讲一下正向代理 HTTPS 流量的机制——

1. 客户端使用明文 HTTP 协议，向代理发送`CONNECT`请求，请求与目标服务器建立一个 TCP 隧道
   
   ```http
   CONNECT example.com:443 HTTP/1.1
   Host: example.com:443
   ```

2. 代理尝试与目标服务器建立 TCP 连接

3. 一旦连接建立，代理告诉客户端连接已建立（返回 200 状态码，跟常见的 200 OK 不一样哦）
   
   ```http
   HTTP/1.1 200 Connection Established
   ```

4. 然后，客户端开始与目标服务器进行 TLS 握手，以此建立加密的连接

5. 此后，所有流量（已加密）只是通过代理传输，而代理不会（也不能）查看其内容，<mark>除非你配置它们为“中间人”攻击模式（Man-in-the-Middle, MITM）</mark>

Nginx 就麻烦在它<mark>默认</mark>不支持 **CONNECT** 方法，因为 Nginx 的设计初衷主要是作为 HTTP 服务器和反向代理来用的，而不是作为正向代理。

所以，通常我们会使用 Squid 来做正向代理，毕竟人家是专业干这个的～

## 解决方案: Squid 正向代理

Squid 是一款流行的、高性能的正向代理和缓存服务器，非常适合我们的问题场景。

### 在 Nginx 服务器上部署 Squid

#### 使用 Docker 安装与运行 Squid

1. **获取 Squid 镜像**:
   
   ```bash
   docker pull sameersbn/squid:latest
   ```

2. **创建 Squid 配置文件目录（自己修改目录位置）**:
   
   ```bash
   mkdir -p /opt/docker/squid/conf
   ```
   
   将定制的 `squid.conf` 文件（如下方所示）放入此目录中。

3. **启动 Squid 容器**:
   
   ```bash
   docker run --name squid -d \
     --publish 3128:3128 \
     --volume /opt/docker/squid/conf/squid.conf:/etc/squid/squid.conf \
     sameersbn/squid:latest
   ```

#### squid.conf 配置文件示例

```conf
# 设置 squid 运行的端口（可以改）
http_port 3128

# 定义“安全”的端口
acl Safe_ports port 80      # http
acl Safe_ports port 443     # https

# 定义哪些方法是允许的
acl allowed_http_methods method CONNECT
acl allowed_http_methods method GET HEAD POST OPTIONS

# 限制非“安全”的端口和方法（引用了上面的定义）
http_access deny !Safe_ports
http_access deny !allowed_http_methods

# 允许来自于本地的 Squid 管理请求，拒绝来自于其他服务器的
http_access allow localhost manager
http_access deny manager

# 允许所有其他请求
http_access allow all

# 设置日志文件位置（末尾的 squid 表示日志格式名，意思类似于 nginx 的 main 日志格式）
access_log /var/log/squid/access.log squid

# 推荐的内存缓存设置
cache_mem 128 MB

# DNS 服务器（定义了阿里和腾讯的 3 个 DNS 服务器，squid 所在的服务器要能访问得通这些 DNS 服务器，不然无法解析域名）
dns_nameservers 223.5.5.5 223.6.6.6 119.29.29.29

# 隐藏请求里的某些信息
forwarded_for off
request_header_access Via deny all
request_header_access X-Forwarded-For deny all
```

## 在应用服务器上配置和使用 Squid

### 环境变量/系统设置

- 通过 Docker 运行参数设置:
  
  ```bash
  docker run -e http_proxy=http://NGINX_SERVER_IP:3128 -e https_proxy=http://NGINX_SERVER_IP:3128 -e no_proxy=INTERNAL_DOMAINS ...
  ```

- 或通过修改 `/etc/environment` 文件（如果改了后不生效，需要 **source /etc/environment** 一下），添加以下内容：
  
  ```bash
  http_proxy=http://NGINX_SERVER_IP:3128
  https_proxy=http://NGINX_SERVER_IP:3128
  no_proxy=INTERNAL_DOMAINS
  ```

        然后在 Docker 运行参数里，可以直接引用咱们在这个文件里定义的环境变量，如下：

```bash
docker run -e http_proxy=$http_proxy -e https_proxy=$https_proxy -e no_proxy=$no_proxy ...
```

此处的 `NGINX_SERVER_IP` 代表 Nginx 服务器的内网 IP 地址。而 `INTERNAL_DOMAINS` 代表不需要通过代理访问的内部域名，多个域名之间用**英文的逗号**分隔开，比如 localhost,127.0.0.1,xxx.xxx.com，**这个 xxx.xxx.com 是我们项目本身的域名，访问项目本身的域名我们不希望它被 Squid 正向代理，而是希望它被 Nginx 反向代理（当然，需要先在应用服务器的 hosts 文件里配好项目域名到 Nginx 服务器内网 IP 地址的解析）！**

### 已有的 Docker 容器不能直接修改

对于已存在的 Docker 容器，直接设置环境变量<mark>**是无效的**</mark>。最佳实践是使用新的环境变量，重建容器，步骤如下：

1. **创建容器的新镜像**：首先，从正在运行的容器上，创建一个新的镜像，并命名成 new_image_name（示例）。

```bash
docker commit <container_id> new_image_name
```

2. **运行新的容器**：使用此新镜像 new_image_name 启动新的容器，并传递所需的环境变量。

```bash
docker run -e http_proxy=$http_proxy -e https_proxy=$https_proxy -e no_proxy=$no_proxy ... new_image_name
```

## 总结

通过 Squid 正向代理的部署和配置，我们可以为无法直接访问公网的应用服务（器）提供一个桥梁，从而允许其访问公网服务。这种方法避免了在应用级别做任何代码上的修改，同时能确保访问的安全性和可控性。

**比较麻烦的一种情况是如果医院的服务器是针对公网 IP 而不是公网域名开放访问白名单的，那就只能整理一下所有域名解析的公网 IP 了，这些 IP 很可能是动态的，当前可以访问，后续 IP 变动可能就访问不了了，需要注意一下。**