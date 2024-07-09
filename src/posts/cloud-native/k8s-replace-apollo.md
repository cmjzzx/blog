# 使用 K8s ConfigMap 替换 Apollo

在微服务架构中，配置管理是一个非常关键的部分。Apollo 是我们使用较多的一个配置管理系统，它提供了实时更新、配置缓存、灰度发布等高级功能。不过随着 Kubernetes 的普及，大家可能会问配置管理与 Kubernetes 的生态系统能否无缝对接呢？答案是肯定的，Kubernetes 里有一个类似的资源，即 ConfigMap，也叫配置字典，主要就是用来干配置管理这件事的。本文将简单介绍一下如何将 Apollo 替换为 Kubernetes ConfigMap，并尽可能少地进行代码改动。看完之后如何选型，相信你就会有自己的答案了！

## 切换步骤

**1. 创建 ConfigMap**

首先，将 Apollo 中的配置项导出，并创建相应的 ConfigMap。比如我们在 Apollo 里有一个名为 my-config 的 app，使用的是 `application.properties` 配置文件，则可以使用以下 YAML 文件创建一个名为 configmap.yaml 的 ConfigMap 资源：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  application.properties: |
    some.config.key=someValue
    another.config.key=anotherValue
    # 其他配置项...
```

然后使用 `kubectl` 命令将其应用到 Kubernetes 集群中的 test 命名空间里：

```sh
kubectl -n test apply -f configmap.yaml
```

**2. 修改 Kubernetes Deployment**

在 Deployment 配置中，将 ConfigMap 挂载到容器的文件系统中，并指定 Spring Boot 使用这个额外的配置文件：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: my-container
        image: my-image
        args:
        - "--spring.config.additional-location=file:/config/application.properties"
        volumeMounts:
        - name: config-volume
          mountPath: /config/application.properties
          subPath: application.properties
      volumes:
      - name: config-volume
        configMap:
          name: my-config
          items:
            - key: application.properties
              path: application.properties
```

**3. 修改 Spring Boot 应用代码**

移除与 Apollo 相关的注解和依赖。在 Spring Boot 应用的启动类中，移除 `@EnableApolloConfig` 注解：

```java
package com.foobar.demo;

import com.ulisesbocchio.jasyptspringboot.annotation.EnableEncryptableProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.ServletComponentScan;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import tk.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@EnableDiscoveryClient
@EnableFeignClients({"demo.service.feign"})
@ServletComponentScan(basePackages = {"demo.config"})
@MapperScan(value = "com.foobar.demo.mapper")
@EnableEncryptableProperties
@ComponentScan(basePackages = { "demo.service.feign", "com.foobar.demo", "demo.aop","demo.config", "demo.user.service", "demo.utils", "cn.foobar"})
public class MyDemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(MyDemoApplication.class, args);
    }
}
```

在 `pom.xml` 中移除 Apollo 客户端的相关依赖：

```xml
<dependency>
  <groupId>com.ctrip.framework.apollo</groupId>
  <artifactId>apollo-client</artifactId>
  <version>1.8.0</version>
</dependency>
```

至此，基本的切换工作就完成了。我们的应用将使用 Kubernetes ConfigMap 中的配置文件，而不再使用 Apollo。

## Apollo 与 ConfigMap 的方案对比

**Apollo 的优势：**

1. **实时更新和热加载**：Apollo 支持配置的实时更新，客户端可以自动接收并应用新配置，无需重启应用。
2. **配置缓存**：Apollo 客户端会将配置缓存到本地，提高读取配置的效率和性能。
3. **灰度发布**：支持配置的灰度发布，可以逐步推送配置变更，降低风险。
4. **版本管理**：Apollo 提供配置的版本控制和回滚功能，方便管理配置历史。

**ConfigMap 的优势：**

1. **与 Kubernetes 深度集成**：ConfigMap 作为 Kubernetes 原生资源，与其他 Kubernetes 资源无缝集成，管理和使用的方式是一致的。
2. **简洁性**：直接在 Kubernetes 中管理配置，减少了引入第三方系统的复杂性。
3. **声明式管理**：通过 YAML 文件声明配置，可以与 Kubernetes 资源一同进行版本控制和审计。
4. **自动化工具支持**：可以与 Helm、Kustomize 等工具配合，支持复杂的部署和配置管理场景。

**ConfigMap 的不足之处：**

1. **缺乏实时更新和热加载**：
   - 可以使用 `Reloader` 等工具监控 ConfigMap 的变化，并自动触发 Pod 重启或信号通知应用重新加载配置。
   - 可以让应用程序实现文件监听机制，自动重新加载配置文件内容。
2. **缺乏配置缓存**：
   - 需要在应用程序中自行实现缓存逻辑，如果需要缓存机制的话。
3. **缺乏高级管理功能**：
   - 可以使用 Helm 管理 ConfigMap，通过 Helm 的版本管理功能实现配置版本控制和回滚。
   - 可以将配置文件存储在 Git 仓库中，通过 Git 的版本控制管理配置变更。

## 结语

将 Apollo 替换为 Kubernetes ConfigMap 并不复杂，但需要注意配置管理的细节改动和功能上的差异。通过使用一些工具和方法，可以弥补 ConfigMap 在配置中心场景下相对于 Apollo 的不足，达到类似 Apollo 的配置管理效果，不过在复杂性上就变得更高了，大家还是得根据自身的实际情况来做决定才最为妥当。