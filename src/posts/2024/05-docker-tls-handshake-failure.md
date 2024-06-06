# 容器里的 Java 应用 TLS 1.3 握手失败问题复盘

## 起因

这几天遇到一个比较有意思的问题，所以写篇文章记录一下。

我想在 K8s 的 Pod 中，使用 Arthas 对我的 Java 应用做一些诊断，方案是通过初始化容器下载 Arthas 的 jar 包，并将其挂载到 Pod 里面的临时卷中，工作容器再挂载这个临时卷，就可以拿到 jar 包，然后我就可以进入工作容器中，执行 `java -jar` 来启动 Arthas 了。当然，使用 NFS 类型的卷也可以，只要把 jar 包放到 nfs 服务器的某个目录下，并挂载这个目录到工作容器里即可。

但是在启动 arthas-boot.jar 时，遇到了如下错误：

```sh
AttachNotSupportedException: Unable to get pid of LinuxThreads manager thread
```

搜了下，发现这个问题还挺常见的，尤其是在容器里启动 arthas。后来看到了[这篇博客](https://robberphex.com/attach-jvm-in-container-at-arthas/)，它里面提到可以考虑更换一下基础镜像来解决这个问题。我原本使用的是一个内部较老的 openjdk 1.8 镜像，大概有 5 年没有更新过了，抱着试一试的态度，决定换成 `eclipse-temurin` 的镜像，最新的轻量版是 `eclipse-temurin:8u412-b08-jdk-alpine` 镜像，那我们就体验下它吧！

### Eclipse Temurin 是啥

顾名思义，这个 Eclipse Temurin 项目应该跟 Eclipse 基金会有关，但具体是个啥，我也是第一次听说，得先了解下——

**Eclipse Temurin 项目**

- **前身**: Eclipse Temurin 源自 AdoptOpenJDK 项目，这个项目致力于提供高质量的开源 Java SE 版本，也就是提供高质量的 OpenJDK 发行版。
- **优势**: 相比于社区维护的 OpenJDK，Eclipse Temurin 提供了更稳定、安全的 Java 版本，拥有更频繁的安全更新和优化，在容器环境中尤其表现出色。

官网介绍看起来还不错，于是我就在 Dockerfile 里把基础镜像换成了这个 `eclipse-temurin:8u412-b08-jdk-alpine`，然后启动容器进行测试。

好消息是，arthas 可以成功启动了。坏消息是，出现了新的问题。

啥问题呢，就是代码去请求 HTTPS 的地址时，100% 会报 TLS 握手失败的错误：

```java
javax.net.ssl.SSLHandshakeException: Received fatal alert: handshake_failure
      at sun.security.ssl.Alert.createSSLException(Alert.java:131)
      at sun.security.ssl.Alert.createSSLException(Alert.java:117)
      at sun.security.ssl.TransportContext.fatal(TransportContext.java:318)
      at sun.security.ssl.Alert$AlertConsumer.consume(Alert.java:293)
      at sun.security.ssl.TransportContext.dispatch(TransportContext.java:185)
      at sun.security.ssl.SSLTransport.decode(SSLTransport.java:152)
      at sun.security.ssl.SSLSocketImpl.decode(SSLSocketImpl.java:1401)
      at sun.security.ssl.SSLSocketImpl.readHandshakeRecord(SSLSocketImpl.java:1309)
      at sun.security.ssl.SSLSocketImpl.startHandshake(SSLSocketImpl.java:440)
```

我们自己内部服务的地址，我从 https 换成 http 的了，反正通过 K8s 的 service 名称和端口，用 http 来访问本身就没问题，也比较推荐。但是代码里还会去请求第三方的地址，那些地址是 https 的，我们没法换成 http 协议来请求，所以这个问题不能讨巧，还是得解决。

## 排查思路

### 1、修改 `java.security` 文件

要解决 TLS 握手失败的问题，修改 `java.security` 文件以启用**无限制加密策略**，是一个比较常见的方案，因为如果加密强度不足，是有可能引起 TLS 握手失败的。

#### `java.security` 文件介绍

`java.security` 文件是 Java 运行时环境（JRE）中的一个配置文件，用于定义各种安全属性和策略。它保存在 JRE 的 `lib/security` 目录中，文件里面包含了影响 Java 应用安全行为的各种设置，虽然开发人员基本上从来不需要关注它，甚至很多人都没听说过这个。

#### 无限制加密策略（Unlimited Cryptography Policy）

Java 的发行版默认启用了限制性加密策略，以便遵循某些国家的法律和出口控制规定，这些限制会禁止使用那些强度较高的加密算法。高强度的加密算法竟然不让用，这是不是有点反常识？但现实就是这么蛋疼。

不过，我们可以启用无限制加密策略，来解除这些限制（有点 hacker 的感觉了），使得 Java 应用能够使用更强的加密算法。

#### 修改步骤

1. **`java.security` 文件位置**：
  这个文件通常位于 JRE 安装目录的 `lib/security` 子目录下，比如 `/opt/java/openjdk/jre/lib/security/java.security`。
  
2. **编辑文件**：
  使用 vi 打开 `java.security` 文件，找到 `crypto.policy` 属性：
  
  ```plaintext
  #crypto.policy=unlimited
  ```
  
3. **取消注释并启用**：
  将该行前的注释符号 `#` 去掉，使其生效：
  
  ```plaintext
  crypto.policy=unlimited
  ```
  
4. **保存文件**：
  保存对 `java.security` 文件的修改，并重启 Java 应用，以使配置生效。
  

我们可以在容器里面重启 Java 应用，但这不是长久之计，一旦容器本身重启了，文件修改的内容就丢失了。所以可以在 Dockerfile 里通过 `RUN sed` 命令查找和替换。

```Dockerfile
…
RUN sed -i 's/^#crypto.policy=unlimited/crypto.policy=unlimited/' /opt/java/openjdk/jre/lib/security/java.security
…
```

遗憾的是，这个方案**没有奏效**，容器里还是报同样的握手异常错误。

### 2、跑测试代码

为了进一步排查问题，我写了 TLSInfo.java 和 SSLTest.java 这两个测试类，以便在容器中，从代码层面测试这个新镜像所使用的 JDK 对于 TLS 协议版本和加密套件的支持情况到底怎么样。

这两个类分别用于测试 JDK 默认使用的 TLS 协议版本和加密套件，以及访问一个 HTTPS 地址获取到的实际响应内容。

`TLSInfo.java`

```java
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.SSLContext;
import java.util.Arrays;

public class TLSInfo {
    public static void main(String[] args) {
        try {
            // 获取默认的 SSLContext
            SSLContext context = SSLContext.getDefault();
            SSLSocketFactory socketFactory = context.getSocketFactory();

            // 获取默认的 SSL 参数
            String[] defaultProtocols = context.getDefaultSSLParameters().getProtocols();
            String[] defaultCipherSuites = context.getDefaultSSLParameters().getCipherSuites();

            System.out.println("Enabled TLS Protocols: " + Arrays.toString(defaultProtocols));
            System.out.println("Enabled Cipher Suites: " + Arrays.toString(defaultCipherSuites));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

编译、运行 `TLSInfo`，输出如下：

```sh
Enabled TLS Protocols: [TLSv1.3, TLSv1.2]
Enabled Cipher Suites: [TLS_AES_256_GCM_SHA384, TLS_AES_128_GCM_SHA256, TLS_DHE_RSA_WITH_AES_256_GCM_SHA384, TLS_DHE_DSS_WITH_AES_256_GCM_SHA384, TLS_DHE_RSA_WITH_AES_128_GCM_SHA256, TLS_DHE_DSS_WITH_AES_128_GCM_SHA256, TLS_DHE_RSA_WITH_AES_256_CBC_SHA256, TLS_DHE_DSS_WITH_AES_256_CBC_SHA256, TLS_DHE_RSA_WITH_AES_128_CBC_SHA256, TLS_DHE_DSS_WITH_AES_128_CBC_SHA256, TLS_DHE_RSA_WITH_AES_256_CBC_SHA, TLS_DHE_DSS_WITH_AES_256_CBC_SHA, TLS_DHE_RSA_WITH_AES_128_CBC_SHA, TLS_DHE_DSS_WITH_AES_128_CBC_SHA, TLS_RSA_WITH_AES_256_GCM_SHA384, TLS_RSA_WITH_AES_128_GCM_SHA256, TLS_RSA_WITH_AES_256_CBC_SHA256, TLS_RSA_WITH_AES_128_CBC_SHA256, TLS_RSA_WITH_AES_256_CBC_SHA, TLS_RSA_WITH_AES_128_CBC_SHA, TLS_EMPTY_RENEGOTIATION_INFO_SCSV]
```

可以看到这个 JDK 默认 TLSv1.3 和 TLSv1.2 都支持，支持的加密套件有 21 种。

`SSLTest.java`

```java
import javax.net.ssl.HttpsURLConnection;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URL;

public class SSLTest {
    public static void main(String[] args) {
        try {
            URL url = new URL("https://cloud.tencent.com");
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setRequestMethod("GET");

            int responseCode = conn.getResponseCode();
            System.out.println("Response Code : " + responseCode);

            BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            String inputLine;
            StringBuilder response = new StringBuilder();

            while ((inputLine = in.readLine()) != null) {
                response.append(inputLine);
            }
            in.close();

            System.out.println(response.toString());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

编译、运行 `SSLTest`，输出如下：

```sh
javax.net.ssl.SSLHandshakeException: Received fatal alert: handshake_failure
        at sun.security.ssl.Alert.createSSLException(Alert.java:131)
        at sun.security.ssl.Alert.createSSLException(Alert.java:117)
        at sun.security.ssl.TransportContext.fatal(TransportContext.java:318)
        at sun.security.ssl.Alert$AlertConsumer.consume(Alert.java:293)
        at sun.security.ssl.TransportContext.dispatch(TransportContext.java:185)
        at sun.security.ssl.SSLTransport.decode(SSLTransport.java:152)
        at sun.security.ssl.SSLSocketImpl.decode(SSLSocketImpl.java:1401)
        at sun.security.ssl.SSLSocketImpl.readHandshakeRecord(SSLSocketImpl.java:1309)
        at sun.security.ssl.SSLSocketImpl.startHandshake(SSLSocketImpl.java:440)
        at sun.net.www.protocol.https.HttpsClient.afterConnect(HttpsClient.java:559)
        at sun.net.www.protocol.https.AbstractDelegateHttpsURLConnection.connect(AbstractDelegateHttpsURLConnection.java:197)
        at sun.net.www.protocol.http.HttpURLConnection.getInputStream0(HttpURLConnection.java:1572)
        at sun.net.www.protocol.http.HttpURLConnection.getInputStream(HttpURLConnection.java:1500)
        at java.net.HttpURLConnection.getResponseCode(HttpURLConnection.java:480)
        at sun.net.www.protocol.https.HttpsURLConnectionImpl.getResponseCode(HttpsURLConnectionImpl.java:352)
        at SSLTest.main(SSLTest.java:13)
```

问题果然复现了，然后我把请求的（腾讯云的）URL 换成另外一个使用 TLS 1.3 协议的网站，即[阿里云](https://cn.aliyun.com)，也报了同样的错误。换成使用 TLS 1.2 协议的[华为云](https://www.huaweicloud.com/)，HTTPS 请求就正常。

情况算是很明确了，这个 JDK 访问 **TLS 1.3** 的站点有问题。问题是现在很多站点，都开启了性能更好也更安全的 TLS 1.3，咱不能说咱们的应用只支持访问 TLS 1.2 的站点吧，那就有点说不过去了。

那有没有可能是服务端站点的 TLS 设置有问题呢？我们换个客户端，改用 curl 来试一下。

### 3、用 curl 来测试

curl 是一个强大的命令行工具，用于从命令行或脚本中进行数据传输，支持许多协议，包括 HTTP 和 HTTPS。

#### 安装 curl

在 Alpine Linux 容器中安装 curl 可以使用以下命令：

```sh
apk add --no-cache curl
```

这样可以确保安装的是最新版本的 curl，并且不会缓存安装包，以节省存储空间。

#### 使用 curl 进行测试

使用 curl 的 -v 选项可以详细输出 HTTPS 请求和响应的调试信息，包括 TLS 握手的详细过程。示例如下：

```sh
curl -v https://verify.ctrial.com/ucd/
```

输出如下：

```sh
* Host verify.ctrial.com:443 was resolved.
* IPv6: (none)
* IPv4: 183.129.254.168
*   Trying 183.129.254.168:443...
* Connected to verify.ctrial.com (183.129.254.168) port 443
* ALPN: curl offers h2,http/1.1
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
*  CAfile: /etc/ssl/certs/ca-certificates.crt
*  CApath: /etc/ssl/certs
* TLSv1.3 (IN), TLS handshake, Server hello (2):
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
* TLSv1.3 (IN), TLS handshake, Certificate (11):
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
* TLSv1.3 (IN), TLS handshake, Finished (20):
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
* TLSv1.3 (OUT), TLS handshake, Finished (20):
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / x25519 / RSASSA-PSS
* ALPN: server accepted http/1.1
* Server certificate:
*  subject: CN=*.ctrial.com
*  start date: May  7 07:42:32 2024 GMT
*  expire date: May  7 07:42:31 2025 GMT
*  subjectAltName: host "verify.ctrial.com" matched cert's "*.ctrial.com"
*  issuer: C=CN; O=Beijing Xinchacha Credit Management Co., Ltd.; CN=Xcc Trust DV SSL CA
*  SSL certificate verify ok.
*   Certificate level 0: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption
*   Certificate level 1: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption
*   Certificate level 2: Public key type RSA (2048/112 Bits/secBits), signed using sha1WithRSAEncryption
* using HTTP/1.x
> GET /ucd/ HTTP/1.1
> Host: verify.ctrial.com
> User-Agent: curl/8.7.1
> Accept: */*
> 
* Request completely sent off
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* old SSL session ID is stale, removing
< HTTP/1.1 302 Found
< Server: nginx
< Date: Thu, 06 Jun 2024 10:24:45 GMT
< Content-Length: 0
< Connection: keep-alive
< Location: https://verify.ctrial.com/ucd/index.html#/login
< Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
< X-XSS-Protection: 1; mode=block
< X-Content-Type-Options: nosniff
< Referrer-Policy: strict-origin-when-cross-origin
< X-Download-Options: noopen
< X-Permitted-Cross-Domain-Policies: none
< 
* Connection #0 to host verify.ctrial.com left intact
```

输出中包含的内容：

* 客户端发送的 ClientHello：显示客户端支持的 TLS 版本。
* 服务器的响应：显示服务器选择的 TLS 版本和加密套件，即 **`SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / x25519 / RSASSA-PSS`**，这是当前此次会话双方共同选择的加密套件，双方本身支持的加密套件肯定是不止这一个的，要注意下。
* 证书信息：显示服务器的证书详细信息，包括颁发者、主题和有效期，以及包含服务器证书、中间证书、根证书的证书链信息。

不管怎么样，用 curl 访问 TLS 1.3 站点**是正常的**。但需要注意的是，curl 使用的是 OpenSSL 库来实现其 TLS/SSL 功能，Java 则是使用 Java Cryptography Architecture (JCA) 和 Java Secure Socket Extension (JSSE) 自己实现了 SSL/TLS，所以两者支持的加密套件并不一样，不能一概而论。