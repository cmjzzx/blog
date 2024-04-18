# Spring Boot 内嵌 Tomcat 容器的网络协议简单压测对比

## Tomcat 连接器 HTTP 协议的 I/O 模型

我们知道，Spring Boot 默认内嵌的 Web Server 是 Tomcat。Tomcat 的连接器组件（即 Connector 组件）支持 HTTP 协议和 AJP 协议。AJP 协议用于 Tomcat 与 Apache 服务器之间的通信，在大多数应用中并不常用，甚至为了安全起见，一般我们会禁用掉 AJP 协议。对于常用的 HTTP 协议来说，Tomcat 支持几种不同的 I/O 模型，包括 BIO、NIO、APR 以及 NIO2（AIO）。

- **BIO (Blocking I/O)**：传统的**阻塞式同步 I/O 模型**，通常一个连接对应一个线程。如果一个用户（或客户端）与服务器建立了一个持久（如 HTTP/1.1 的 keep-alive）的连接，并发起多次请求，如果是串行请求，那它们就会在同一个连接（即同一个线程）中进行处理，一次处理一个。如果遇到了阻塞操作（例如，等待 I/O 完成，如数据库操作、文件访问、请求第三方接口等），这个线程将会被阻塞，同一用户（或客户端）的后续请求必须等待当前请求完成后（即线程可用后），才能开始处理。在高并发的场景下，这种阻塞的线程越多，可用的线程数就会越少甚至耗尽线程数，当前正在访问的用户以及后续要访问的新用户，都会受到很大的影响，性能与体验都是非常糟糕的。在 Tomcat 8 之前的版本中，BIO 是默认的 I/O 模型。
- **NIO (Non-blocking I/O)**：基于通道（Channel）和选择器（Selector）的**非阻塞式同步 I/O 模型**，支持非阻塞式的读写操作，允许单个线程或者几个线程处理多个连接/通道，能大大减少系统对线程的需求，提供更高效的性能和良好的可扩展性，因此可以支持比 BIO 更大的并发。**从 Tomcat 8 开始，NIO 成为默认模型**。
- **APR (Apache Portable Runtime)**：Apache 可移植式运行时（可以理解成是 Apache HTTP 服务器的核心精简版本），使用本地代码库（native library）来优化 I/O 操作，可以提供接近于操作系统的性能（尤其是在处理静态文件和 SSL 加密通信时，不过我们通常都是在 Nginx 那边做 SSL 配置），通常比 BIO 或 NIO 更快。**如果要使用 APR，需要在服务器上安装 APR 和 Tomcat Native 库，并进行相关配置**，这一点需要注意。
- **NIO2 (AIO)**：基于 Java 7 中引入的异步 I/O API（Asynchronous I/O），也称作 NIO2，提供真正的异步非阻塞 I/O。

BIO 是在 Tomcat 8 之前的版本里默认使用，就不对比了。这次咱们主要来简单对比一下 Tomcat 使用 NIO 和 APR 的性能差异。**<mark>事先说明，因测试数据样本量很小，测试结果仅供参考，请酌情使用</mark>**。

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

以上是在 CentOS 服务器宿主机上安装 APR 和 Tomcat Native 的步骤，不过我们现在的 Spring Boot 应用都是跑在 docker 容器里，使用的基础镜像大多是基于 Alpine Linux 或其他一些精简的 Linux 发行版的，想要在 Alpine Linux 里面编译 Tomcat Native 源码则会比较麻烦，比如需要安装 gcc、make 等依赖。一个方案是在你自己的 Dockerfile 文件里使用 RUN 命令进行相关依赖和库的安装，另外一个方案是自己编译一个基础镜像，里面把所用到的编译工具、APR 以及 Tomcat Native 库都构建进去，然后使用这个基础镜像来构建你的 Spring Boot 应用。不过，咱们还是先来看看实际的压测对比结果再说吧。

## 实际压测结果

先交代一下压测的相关环境信息——

1. 压测机

    MacBook Pro 2019 15 寸，2.3 GHz 八核 Intel Core i9，16 GB 2400 MHz DDR4，通过公司 Wi-Fi 用内网 IP 加端口，访问被压测服务器。公司内网网络是千兆带宽，压测机因为连接的是共用的无线网 AP，非独占带宽，实际带宽会小于千兆。

    压测机上使用的 JMeter 版本是 5.4.1，使用的 JDK 是 1.8.0_301。

2. 被压测服务器

    KVM 虚拟机，8 核 Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz，32 GB 内存，是我们业务服务器的测试环境，平均 CPU 负载很低。

3. 压测对象

    压测对象是被压测服务器上 Tomcat 9.0.12 的首页地址（**纯静态资源，不包括返回动态内容的接口地址，因此不具备很强的代表性**），即 http://192.168.3.145:8080，使用的 JDK 是 OpenJDK 1.8.0_342。

下面是 4 轮压测的结果表，根据不同的线程数量和协议处理器 (`NIO` 和 ` APR`) 进行分类。Ramp-up Period 都设置为 1，Loop Count 都设置为 10（最后一轮测试设置成了 20）。

### Number of Threads: 100
| Protocol Handler     | Requests | Avg Response Time (ms) | Min Response Time (ms) | Max Response Time (ms) | Std Dev | Error Rate (%) | Throughput (TPS) | Bytes Received per Sec | Bytes Sent per Sec | Avg Bytes per Sec |
|----------------------|----------|------------------------|------------------------|------------------------|---------|----------------|------------------|------------------------|--------------------|-------------------|
| NIO        | 1000     | 99                     | 21                     | 244                    | 58.65   | 0.0            | 495.54           | 5555.24                | 86.14              | 11479.53          |
|  APR        | 1000     | 157                    | 21                     | 409                    | 70.66   | 0.0            | 420.70           | 4716.29                | 73.13              | 11479.67          |

### Number of Threads: 200
| Protocol Handler     | Requests | Avg Response Time (ms) | Min Response Time (ms) | Max Response Time (ms) | Std Dev | Error Rate (%) | Throughput (TPS) | Bytes Received per Sec | Bytes Sent per Sec | Avg Bytes per Sec |
|----------------------|----------|------------------------|------------------------|------------------------|---------|----------------|------------------|------------------------|--------------------|-------------------|
| NIO        | 2000     | 271                    | 22                     | 735                    | 146.16  | 0.0            | 503.02           | 5638.74                | 87.44              | 11478.84          |
|  APR        | 2000     | 265                    | 22                     | 600                    | 124.95  | 0.0            | 512.16           | 5741.06                | 89.03              | 11478.45          |

### Number of Threads: 500
| Protocol Handler     | Requests | Avg Response Time (ms) | Min Response Time (ms) | Max Response Time (ms) | Std Dev | Error Rate (%) | Throughput (TPS) | Bytes Received per Sec | Bytes Sent per Sec | Avg Bytes per Sec |
|----------------------|----------|------------------------|------------------------|------------------------|---------|----------------|------------------|------------------------|--------------------|-------------------|
| NIO        | 5000     | 915                    | 27                     | 2781                   | 361.58  | 0.0            | 490.00           | 5492.37                | 85.18              | 11477.84          |
|  APR        | 5000     | 912                    | 26                     | 2280                   | 318.43  | 0.0            | 469.18           | 5258.99                | 81.56              | 11478.02          |

### Number of Threads: 1500
| Protocol Handler     | Spend Time | Requests | Avg Response Time (ms) | Min Response Time (ms) | Max Response Time (ms) | Std Dev | Error Rate (%) | Throughput (TPS) | Bytes Received per Sec | Bytes Sent per Sec | Avg Bytes per Sec |
|----------------------|------------|----------|------------------------|------------------------|------------------------|---------|----------------|------------------|------------------------|--------------------|-------------------|
| NIO        | 00:01:24   | 30000    | 3899                   | 25                     | 13058                  | 1937.42 | 0.0769         | 357.23           | 3738.20                | 59.12              | 10715.50          |
|  APR        | 00:01:00   | 30000    | 2780                   | 22                     | 11720                  | 1139.34 | 0.1144         | 497.05           | 4949.70                | 85.72              | 10197.13          |


## 压测结果简单分析

通过分析上述的 JMeter 测试数据，可以得出一些关于服务器性能、I/O 模型（NIO 与 APR）性能的粗略结论：

### 1. **被压测服务器的性能**
- 随着并发线程数的增加，服务器的平均响应时间显著增加。比如在 NIO 模型下，当线程数从 100 增加到 1500 时，平均响应时间从 99 毫秒上升到 3899 毫秒，增加了几十倍，说明随着负载增加，服务器的性能出现了明显的下降。

### 2. **吞吐量（TPS）**
- 在并发线程数较低时（100 和 200 线程），NIO 的吞吐量（TPS）略高于 APR。但在线程数增加到 1500 时，APR 的吞吐量超过了 NIO。说明在高并发情况下，APR 可能更能有效地处理连接。

### 3. **最大和最小响应时间**
- 最小响应时间在不同的并发线程数下相对比较稳定，说明服务器在开始处理请求时能够快速响应。但最大响应时间却随着并发线程数增加而显著增加，特别是在 1500 线程数的测试中增加得非常明显，这就想不通是为啥了……

### 4. **错误率**
- 错误率大部分时候都是 0.0%，但是在 1500 并发线程数的测试中，APR 模型得到了 0.1144% 的错误率，这可能是由于系统负载过高，导致处理某些请求时出现了问题吧。

简单总结下，就是**如果你的应用在高性能 SSL 加密（通常都是交给 Nginx 来做，很少让 Tomcat 做这个）、高并发连接处理方面有较高的要求，APR 可能是一个可行的方案。而如果你需要一个易于维护和理解、资源使用高效、日常业务量根本没有那么高并发的应用，其实使用 Tomcat 默认的 NIO 可能更合适**。话又说回来，想开发一个高性能的应用，谁会先考虑切换 Tomcat 的 I/O 模型呢？

