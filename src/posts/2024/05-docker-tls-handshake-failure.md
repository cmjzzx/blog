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

```
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

### Java cacerts 根证书

Java 自带一个 keystore 文件，称为 cacerts，默认路径是 `$JAVA_HOME/jre/lib/security/cacerts`（或 `$JAVA_HOME/lib/security/cacerts`），其中包含了许多公认的受信任的根证书（由 Oracle 进行维护），使得 Java 应用能够信任这些 CA 签发的证书。

这里稍微延伸讲一下为什么 Java 默认不使用操作系统的根证书信任库，主要有下面几个原因：

* 跨平台一致性: Java 是跨平台的，而不同操作系统的信任库格式和位置可能会有所不同。通过使用自己的 cacerts 文件，Java 可以确保应用程序在所有平台上都有一致的行为和配置。
* 独立性: 依赖于操作系统的信任库可能会导致一些不可预测的行为，尤其是在不同的操作系统版本或配置之间。因此，Java 自己管理一套信任库，可以减少由于操作系统变更导致的问题。
* 安全性和控制: 通过维护自己的 cacerts 文件，Java 可以更严格地控制哪些证书可以被信任。这对于运行在不同环境/平台中的 Java 应用程序来说，可以提供额外的安全保障。 
* 更新和管理: Java 可以独立于操作系统进行证书更新和管理。这样，我们可以更方便灵活地添加、删除或更新信任的证书，而不必依赖操作系统的更新。

#### 为什么要导入根证书？

我们知道服务器的 SSL 证书通常由受信任的证书颁发机构（CA）来签发。为了验证服务器证书的有效性，客户端需要信任这个 CA。如果 Java 的 cacerts 文件里没有某些服务器证书的 CA 根证书（当然，这种情况的概率是很小的，除非是自签名的根证书），就会导致 Java 应用不信任这个服务器证书，进而导致 TLS 握手失败。

#### 导入根证书的步骤

我们可以先更新下系统的根证书存储，然后将系统根证书导入到 Java cacerts 文件里，步骤如下：

1. 安装系统根证书包：
   ```sh
   apk add ca-certificates
   ```

2. 更新系统根证书：
   ```sh
   update-ca-certificates
   ```

3. 查找系统根证书存储的位置，通常在 `/etc/ssl/certs/ca-certificates.crt`。

4. 使用 `keytool` 命令将系统根证书导入 Java `cacerts` 文件：
   ```sh
   sudo keytool -import -trustcacerts -file /etc/ssl/certs/ca-certificates.crt -keystore $JAVA_HOME/jre/lib/security/cacerts -storepass changeit
   ```

   请注意：
   - `$JAVA_HOME` 这个环境变量需要存在且有效。
   - `changeit` 是 Java `cacerts` 文件的默认密码，如果已更改，请使用新的密码，如果没更改，使用 changeit 就行。

5. 确认导入的证书：
   ```sh
   sudo keytool -list -keystore $JAVA_HOME/jre/lib/security/cacerts -storepass changeit
   ```

执行 `apk add ca-certificates` 和 `update-ca-certificates` 命令会更新系统的根证书存储，不会直接影响 Java 的 `cacerts` 文件。Java 的 `cacerts` 文件是独立的，默认情况下不会自动同步系统的根证书存储，所以可以通过以上步骤来将系统的根证书信息同步到 Java 的 `cacerts` 文件里来。

通常来讲，这样就够了，因为更新之后的系统根证书存储里，基本上覆盖了市面上所有的 CA 根证书信息，也就意味着一般不需要再手动把服务器证书的根证书信息抽取出来进行导入了。

只要不是自签名的根证书，由 CA 签发的服务器证书，肯定是可以通过系统的根证书存储验证的。当然，系统根证书信息被同步到 Java 的 `cacerts` 文件里后，服务器证书也可以被 Java 所信任。

如果是自签名的服务器证书（内部测试使用），也可以导入到 Java 的 `cacerts` 文件里，这里又分成两种情况：

* 直接自签名的服务器证书：导入自签名的服务器证书。
* 使用自签名 CA 根证书签发的服务器证书：导入自签名的 CA 证书，这样的话 Java 应用程序将信任由这个 CA 证书签发的任何服务器证书。

不过，这个方案最终也没奏效，报错依旧。

### 启用 SSL 调试

可以通过设置 Java 的系统属性来启用 SSL 调试，输出详细的 SSL 调试信息，这样会打印出握手过程中发生的每一步，帮助我们识别出问题所在。

#### 启用 SSL 调试的步骤

1. **设置系统属性**：
   在运行 Java 应用程序时，可以通过添加 JVM 系统属性参数来启用详细的调试输出：
   ```sh
   # SSLTest 是我测试用的类，也可以对 jar 包开启
   java -Djavax.net.debug=all SSLTest
   ```

2. **查看调试输出**：
   运行后，控制台上会输出大量冗长的调试信息。这些信息包括：
   - Java cacerts 文件里保存的根证书信息（篇幅很长）
   - 各种 SSL 协议的消息（如 ClientHello、ServerHello 等）。
   - 密钥交换和加密算法的选择。
   - 证书验证的详细信息。
   - 握手过程中的各个步骤和状态变化。

#### 关键点

调试输出中包含大量信息，我们只需要关注以下关键点：

1. **ClientHello 和 ServerHello**：
   - ClientHello：显示客户端支持的 SSL/TLS 版本（**`supported_versions`** 字段）和加密套件（**`cipher suites`** 字段）。
   - ServerHello：显示服务器选择的 SSL/TLS 版本（**`selected version`** 字段）和加密套件（**`cipher suite`** 字段），但是如果握手失败了，就看不到 ServerHello 相关信息了。

2. **握手失败原因**：
   - 查看是否有 “handshake_failure” 或其他的错误提示。
   - 这些错误提示一般会提供关于问题的具体细节，如不支持的协议版本或加密套件。

3. **证书验证**：
   - 确认客户端和服务器都能正确地交换和验证证书。
   - 查看证书链是否完整以及是否有任何验证错误。

我这样尝试后，日志里果然出现了之前那个 `javax.net.ssl.SSLHandshakeException: Received fatal alert: handshake_failure` 错误，但是看不到更多的错误信息了，咱们继续。

### 查询服务器端支持的所有 TLS 版本加密套件

前面我们用 TLSInfo 测试类测试了下容器里的 jdk 所能支持的全部 TLS 版本和加密套件，现在我们再来看看服务器端的情况。因为在 TLS 握手过程中，服务器会根据客户端发送的支持的 TLS 版本和加密套件（在 `ClientHello` 消息里可以看到），从自己支持的 TLS 版本和加密套件中选择一个与客户端匹配的组合。如果没有找到匹配的组合，TLS 握手将会失败。

可以使用 nmap 工具，对服务器支持的 TLS 版本和加密套件进行扫描。nmap 是一个强大的网络扫描工具，一般是用来扫描目标地址开放的端口列表的，但也可以通过特定脚本来**枚举** SSL/TLS 的配置，包括加密套件、协议版本等。

#### 使用 nmap 的具体步骤

1. **安装 nmap**：
   在大多数 Linux 发行版中，可以通过包管理器安装 nmap。例如，在 Debian 或 Ubuntu 中：
   ```sh
   sudo apt-get install nmap
   ```
   
   在 CentOS 中：
   ```sh
   sudo yum install nmap
   ```

   Mac 上可以用 `brew install nmap` 进行安装。

2. **运行 nmap 脚本**：
   使用 `--script` 选项指定 `ssl-enum-ciphers` 脚本（顾名思义这是一个用于枚举 SSL/TLS 协议和加密套件的脚本），扫描特定的端口（通常是 443 端口）：
   ```sh
   nmap --script ssl-enum-ciphers -p 443 verify.ctrial.com
   ```

3. **解释输出结果**：
   输出结果将显示服务器支持的 TLS 版本和加密套件。例如：
   ```
   Starting Nmap 7.95 ( https://nmap.org ) at 2024-06-07 10:22 CST
   Nmap scan report for verify.ctrial.com (192.168.0.50)
   Host is up (0.012s latency).
   rDNS record for 192.168.0.50: baoleiji.ucmed.cn

   PORT    STATE SERVICE
   443/tcp open  https
   | ssl-enum-ciphers:
   |   TLSv1.2:
   |     ciphers:
   |       TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256 (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256 (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384 (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA (ecdh_x25519) - A
   |       TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA (ecdh_x25519) - A
   |       TLS_RSA_WITH_AES_128_GCM_SHA256 (rsa 2048) - A
   |       TLS_RSA_WITH_AES_256_GCM_SHA384 (rsa 2048) - A
   |       TLS_RSA_WITH_AES_128_CBC_SHA256 (rsa 2048) - A
   |       TLS_RSA_WITH_AES_256_CBC_SHA256 (rsa 2048) - A
   |       TLS_RSA_WITH_AES_128_CBC_SHA (rsa 2048) - A
   |       TLS_RSA_WITH_AES_256_CBC_SHA (rsa 2048) - A
   |     compressors:
   |       NULL
   |     cipher preference: server
   |   TLSv1.3:
   |     ciphers:
   |       TLS_AKE_WITH_AES_256_GCM_SHA384 (ecdh_x25519) - A
   |       TLS_AKE_WITH_CHACHA20_POLY1305_SHA256 (ecdh_x25519) - A
   |       TLS_AKE_WITH_AES_128_GCM_SHA256 (ecdh_x25519) - A
   |     cipher preference: server
   |_  least strength: A
   ```

#### 匹配客户端和服务器的加密套件

在获取服务器支持的加密套件之后，需要确认客户端发送的 ClientHello 包中实际包含的加密套件（jdk 默认支持的加密套件列表和在 ClientHello 消息里实际发送的加密套件列表可能会不同，实际发送的列表通常是默认列表的一个子集，需要注意下）是否与服务器支持的加密套件匹配。如果有至少一个共同的加密套件，那么握手应该就能成功。在 SSL 的 debug 调试日志中，ClientHello 包里会显示客户端实际发送的加密套件列表。

报握手失败的 ClientHello 包里看到的实际 TLS 协议版本和加密套件如下所示：

```
"supported_versions (43)": {
      "versions": [TLSv1.3]
    },
```

和

```sh
"cipher suites"       : "[TLS_AES_256_GCM_SHA384(0x1302), TLS_AES_128_GCM_SHA256(0x1301)]",
```

也就是实际发送的是 TLS 1.3 版本，加密套件是 TLS 1.3 支持的 TLS_AES_256_GCM_SHA384 和 TLS_AES_128_GCM_SHA256 这两个。然后上面用 nmap 扫描输出的 3 个 TLS 1.3 的加密套件里有两个是：

* TLS_AKE_WITH_AES_256_GCM_SHA384
* TLS_AKE_WITH_AES_128_GCM_SHA256

前缀（TLS_AKE）有点不一样，但它们实际上就是标准的 TLS 1.3 加密套件：

* TLS_AES_256_GCM_SHA384
* TLS_AES_128_GCM_SHA256

因此，客户端（我的 Java 应用）和服务器支持以下共同的 TLSv1.3 加密套件：

* TLS_AES_256_GCM_SHA384
* TLS_AES_128_GCM_SHA256

按理说，TLS 握手不会失败。但现实就是，握手失败了。

排查到这里，我实在是没啥办法了。不过幸运的是我 google 了一下 “eclipse-temurin jdk 8 tls 1.3”，被我看到了下面这个 GitHub Issue，而这个正是解决问题的真正答案所在。

### 安装 libgcc 

搜到了这么一个 GitHub Issue [Missing ECDHE Ciphers in 8-jdk-alpine](https://github.com/adoptium/temurin-build/issues/3002)，看起来跟我的问题很接近。尤其是里面的一个评论提到了在安装 **libgcc** 前后，jdk 所支持的加密套件列表有很大的差别，nice，这个可能就是答案所在了！

大家知道，`libgcc` 是 GCC（GNU Compiler Collection）的运行时库，包含了一些基本的低级支持功能，如异常处理、内存管理和特定硬件指令的支持。虽然这些功能在一般情况下不会直接影响到 SSL/TLS，但某些高级加密操作可能依赖于这些底层功能。正如 Issue 里提到的，缺少 `libgcc` 库，会导致 `libsunec.so` 库存在问题。而 `libsunec.so` 是 JDK 的一部分，用来处理基于椭圆曲线加密 (ECC) 的操作，如 ECDHE 等以 EC 开头的加密套件的相关操作。如果缺少 `libgcc`，`libsunec.so` 可能无法正确加载其依赖的某些底层库，导致相关加密功能不可用，如 TLS 握手失败。

#### 在容器中安装 libgcc

在 Alpine Linux 容器中，安装 `libgcc` 库的具体步骤如下：

1. **更新包管理器索引**：
   ```sh
   apk update
   ```

2. **安装 libgcc**：
   ```sh
   apk add --no-cache libgcc
   ```

安装 `libgcc` 后，`libsunec.so` 这个库能够正确加载并使用所有的底层依赖库，恢复了对完整的加密套件列表的支持，这使得客户端（Java 应用）可以给服务器端发送更多的加密套件，从而增加了与服务器成功匹配的机会，解决握手失败的问题。

#### 验证 libgcc 的作用

在安装 `libgcc` 之后，再次运行之前的测试类，观察是否还会出现握手失败的问题。如下所示：

1. **运行 TLSInfo.java**:
   ```sh
   java TLSInfo
   ```

2. **运行 SSLTest.java**:
   ```sh
   java SSLTest
   ```

输出显示一切正常，测试类可以成功运行，并且打印出来的可支持的加密套件比之前多了一倍，之前是 21 种，现在变成了 45 种。

```
Enabled TLS Protocols: [TLSv1.3, TLSv1.2]
Enabled Cipher Suites: [TLS_AES_256_GCM_SHA384, TLS_AES_128_GCM_SHA256, TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384, TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256, TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256, TLS_DHE_RSA_WITH_AES_256_GCM_SHA384, TLS_DHE_DSS_WITH_AES_256_GCM_SHA384, TLS_DHE_RSA_WITH_AES_128_GCM_SHA256, TLS_DHE_DSS_WITH_AES_128_GCM_SHA256, TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384, TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384, TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256, TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256, TLS_DHE_RSA_WITH_AES_256_CBC_SHA256, TLS_DHE_DSS_WITH_AES_256_CBC_SHA256, TLS_DHE_RSA_WITH_AES_128_CBC_SHA256, TLS_DHE_DSS_WITH_AES_128_CBC_SHA256, TLS_ECDH_ECDSA_WITH_AES_256_GCM_SHA384, TLS_ECDH_RSA_WITH_AES_256_GCM_SHA384, TLS_ECDH_ECDSA_WITH_AES_128_GCM_SHA256, TLS_ECDH_RSA_WITH_AES_128_GCM_SHA256, TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA384, TLS_ECDH_RSA_WITH_AES_256_CBC_SHA384, TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA256, TLS_ECDH_RSA_WITH_AES_128_CBC_SHA256, TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA, TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA, TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA, TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA, TLS_DHE_RSA_WITH_AES_256_CBC_SHA, TLS_DHE_DSS_WITH_AES_256_CBC_SHA, TLS_DHE_RSA_WITH_AES_128_CBC_SHA, TLS_DHE_DSS_WITH_AES_128_CBC_SHA, TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA, TLS_ECDH_RSA_WITH_AES_256_CBC_SHA, TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA, TLS_ECDH_RSA_WITH_AES_128_CBC_SHA, TLS_RSA_WITH_AES_256_GCM_SHA384, TLS_RSA_WITH_AES_128_GCM_SHA256, TLS_RSA_WITH_AES_256_CBC_SHA256, TLS_RSA_WITH_AES_128_CBC_SHA256, TLS_RSA_WITH_AES_256_CBC_SHA, TLS_RSA_WITH_AES_128_CBC_SHA, TLS_EMPTY_RENEGOTIATION_INFO_SCSV]
```

可以用 strace 工具来跟踪一下 Java 应用加载的共享库文件，来看看 libgcc_s.so.1 是否被正确加载到了。

先执行 `apk add --no-cache strace` 安装 `strace` 工具，再运行：

```sh
strace -f -e trace=all java TLSInfo 2>&1 | grep '\.so'
```

关注下面这些信息：

```
[pid  1816] stat("/opt/java/openjdk/jre/lib/ext/amd64/libsunec.so",  <unfinished ...>
[pid  1816] stat("/opt/java/openjdk/jre/lib/ext/libsunec.so",  <unfinished ...>
[pid  1816] stat("/opt/java/openjdk/jre/lib/amd64/libsunec.so", {st_mode=S_IFREG|0755, st_size=291304, ...}) = 0
[pid  1816] open("/opt/java/openjdk/jre/lib/amd64/libsunec.so", O_RDONLY|O_LARGEFILE) = 14
[pid  1816] open("/opt/java/openjdk/jre/lib/amd64/libsunec.so", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = 14
[pid  1816] open("/opt/java/openjdk/jre/lib/amd64/server/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/opt/java/openjdk/jre/lib/amd64/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/opt/java/openjdk/jre/../lib/amd64/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/opt/java/openjdk/bin/../lib/amd64/jli/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/opt/java/openjdk/bin/../lib/amd64/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/lib/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/usr/local/lib/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = -1 ENOENT (No such file or directory)
[pid  1816] open("/usr/lib/libgcc_s.so.1", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = 14
```

可以看到 `libsunec.so` 和 `libgcc_s.so.1` 确实都被加载了，而 `/usr/lib/libgcc_s.so.1` 这个正是我们刚刚安装的那个，这就说明 Java 应用现在可以使用 `libgcc` 提供的功能了！

## 总结

林林总总各种方案，总结下来有一个感觉就是更换基础镜像，尤其是自己不熟悉的镜像如基于 Alpine 的 eclipse-temurin openjdk 发行版镜像，还是有一些风险的，因为你不知道它里面裁剪了哪些库文件或者工具，导致意外的问题出现。

不过也通过对这次问题的排查，了解到了一些基础库的作用，可以说是为在容器环境中运行 Java 应用提供了宝贵的教训和参考了。

后续再考虑一下升级 JDK 版本，JDK 8 也真的是太老了……