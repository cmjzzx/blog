# Spring Boot 内嵌 Tomcat 容器的网络协议简单压测对比

## Tomcat 连接器 HTTP 协议的 I/O 模型

我们知道，Spring Boot 默认内嵌的 Web Server 是 Tomcat。Tomcat 的连接器组件（即 Connector 组件）支持 HTTP 协议和 AJP 协议。AJP 协议用于 Tomcat 与 Apache 服务器之间的通信，在大多数应用中并不常用，甚至为了安全起见，一般我们会禁用掉 AJP 协议。对于常用的 HTTP 协议来说，Tomcat 支持几种不同的 I/O 模型，包括 BIO、NIO、APR 以及 NIO2（AIO）。

- **BIO (Blocking I/O)**：传统的**阻塞式同步 I/O 模型**，通常一个连接对应一个线程。如果一个用户（或客户端）与服务器建立了一个持久（如 HTTP/1.1 的 keep-alive）的连接，并发起多次请求，如果是串行请求，那它们就会在同一个连接（即同一个线程）中进行处理，一次处理一个。如果遇到了阻塞操作（例如，等待 I/O 完成，如数据库操作、文件访问、请求第三方接口等），这个线程将会被阻塞，同一用户（或客户端）的后续请求必须等待当前请求完成后（即线程可用后），才能开始处理。在高并发的场景下，这种阻塞的线程越多，可用的线程数就会越少甚至耗尽线程数，当前正在访问的用户以及后续要访问的新用户，都会受到很大的影响，性能与体验都是非常糟糕的。在 Tomcat 8 之前的版本中，BIO 是默认的 I/O 模型。
- **NIO (Non-blocking I/O)**：基于通道（Channel）和选择器（Selector）的**非阻塞式同步 I/O 模型**，支持非阻塞式的读写操作，允许单个线程或者几个线程处理多个连接/通道，能大大减少系统对线程的需求，提供更高效的性能和良好的可扩展性，因此可以支持比 BIO 更大的并发。**从 Tomcat 8 开始，NIO 成为默认模型**。
- **APR (Apache Portable Runtime)**：Apache 可移植式运行时（可以理解成是 Apache HTTP 服务器的核心精简版本），使用本地代码库（native library）来优化 I/O 操作，可以提供接近于操作系统的性能（尤其是在处理静态文件和 SSL 加密通信时，不过我们通常都是在 Nginx 那边做 SSL 配置），通常比 BIO 或 NIO 更快。**如果要使用 APR，需要在服务器上安装 APR 和 Tomcat Native 库，并进行相关配置**，这一点需要注意。
- **NIO2 (AIO)**：基于 Java 7 中引入的异步 I/O API（Asynchronous I/O），也称作 NIO2，提供真正的异步非阻塞 I/O。

BIO 是在 Tomcat 8 之前的版本里默认使用，就不对比了。这次咱们主要来简单对比一下 Tomcat 使用 NIO 和 APR 的性能差异。事先说明，因测试数据样本量很小，测试结果仅供参考，请酌情使用。

## 安装 APR 和 Tomcat Native

首先，我们需要在服务器上安装 APR 和 Tomcat Native 库。

### 安装 APR

APR 是 Tomcat Native 的依赖之一。在 CentOS 上，可以通过 yum 包管理器来安装它。

1. **更新包管理器**（可选，但推荐）：
   ```sh
   sudo yum update
   ```

2. **安装 APR 和 APR-util**：

    在安装之前，也可以先查看下服务器上是否已经安装过了 APR，命令如下：

   ```sh
   rpm -qa | grep apr
   ```

    如果没有任何输出，则表示没有安装过，那就可以用下面的命令进行安装：

   ```sh
   sudo yum install apr apr-devel apr-util apr-util-devel
   ```

### 安装 Tomcat Native

安装 Tomcat Native 库需要编译源代码，因为它需要与服务器上的 APR 库和 Java 环境相匹配。

1. **安装编译工具和 OpenSSL 开发包**

   ```sh
   sudo yum groupinstall 'Development Tools'
   sudo yum install openssl-devel
   ```

2. **下载 Tomcat Native 源码**

    可以从 Apache 官网下载最新的 Tomcat Native 源码包，假设我们使用 Tomcat Native 1.2.39 版本（可根据需要替换为最新版本）：

   ```sh
   cd /usr/local/src
   sudo wget https://downloads.apache.org/tomcat/tomcat-connectors/native/1.2.39/source/tomcat-native-1.2.39-src.tar.gz
   sudo tar -xzf tomcat-native-1.2.39-src.tar.gz
   ```

3. **编译和安装 Tomcat Native**

    针对已安装的 JDK 版本及其路径，指定 Java 的 `JAVA_HOME` 环境变量。以下示例假设使用的是 OpenJDK 8，并且它安装在 `/usr/lib/jvm/java-1.8.0-openjdk`（请根据实际情况调整路径）：

   ```sh
   cd tomcat-native-1.2.39-src/native
   sudo ./configure --with-apr=/usr/bin/apr-1-config --with-java-home=/usr/lib/jvm/java-1.8.0-openjdk --with-ssl=yes --prefix=/usr/local
   sudo make && sudo make install
   ```

4. **配置 Tomcat 以使用 Tomcat Native**

    安装完成后，需要告诉 Tomcat 去哪里找到 Tomcat Native 的库文件。编辑你安装的 Tomcat 目录下的设置文件（例如，`bin/setenv.sh`，如果这个文件不存在，就创建它，文件名就叫 setenv.sh），添加以下行：

   ```sh
   export LD_LIBRARY_PATH='$LD_LIBRARY_PATH:/usr/local/lib'
   ```

   这样 Tomcat 在启动时就会包含 `/usr/local/lib` 目录，这是 Tomcat Native 库默认的安装位置。

5. **重启 Tomcat**

    重启 Tomcat，使设置生效。

以上是在 CentOS 服务器宿主机上安装 APR 和 Tomcat Native 的步骤，不过我们现在的 Spring Boot 都是跑在 docker 容器里，使用的基础镜像大多是基于 Alpine Linux 的，想要在 Alpine Linux 里面编译 Tomcat Native 源码会比较麻烦。

