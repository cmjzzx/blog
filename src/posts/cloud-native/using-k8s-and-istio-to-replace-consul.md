# 使用 K8s Service + Istio 替换 Consul

大家好，今天咱们聊一聊怎样将项目里使用的 Consul 替换成 Kubernetes Service 和 Istio。

随着微服务架构的普及，服务发现和管理变得越来越重要。Consul 目前已经成为了一种非常流行的服务网格解决方案，虽然它最开始主要是用来做服务注册、服务发现，以及健康检查的。但随着项目的不断发展，我们发现使用 Kubernetes 自带的服务发现机制和 Istio 服务网格的强大流量管理功能，可以让我们的系统更加简洁高效一些。

迁移到 Kubernetes Service 和 Istio 可以简化我们的服务发现过程，减少运维部署和维护的成本，同时还可以利用 Istio 的强大功能来管理服务间的通信。好了，话不多说，咱们直接开始吧！

我们有一个小型的应用，微服务数量在 10 个左右，其中有一个基于 Spring Cloud Gateway 的网关微服务，其他则都是按功能拆分的应用微服务，比如用户微服务等。具体的迁移过程可以分成如下 5 个步骤：

## 1、修改网关微服务的配置

首先要做的，就是修改网关微服务的 Apollo 配置文件。你可能会问为什么？因为我们需要将 `uri` 从 `lb://` 格式改为 `http://` 格式，并指向 Kubernetes 的 Service 地址。这样，我们的网关微服务就不会再去请求 Consul 服务注册中心来发现其他应用微服务的地址了。

### 原始 Apollo 配置（使用 Consul）

```yaml
spring:
  cloud:
    gateway:
      routes:
      - id: user_route
        uri: lb://gcp-service-user
        predicates:
        - Path=/user/**
        filters:
        - StripPrefix=1
```

### 修改后的 Apollo 配置（使用 Kubernetes Service）

```yaml
spring:
  cloud:
    gateway:
      routes:
      - id: user_route
        uri: http://gcp-user-web.gcp.svc.cluster.local:8080
        predicates:
        - Path=/user/**
        filters:
        - StripPrefix=1
```

这样改完之后，网关微服务将直接通过 Kubernetes Service 进行访问，不再需要依赖 Consul 来发现服务。

具体看一下修改之后的 uri 地址，`http://gcp-user-web.gcp.svc.cluster.local` 这个 Service 的地址里，gcp-user-web 部分是 Service 的名称，gcp 部分是 Service 所在的命名空间，svc.cluster.local 部分是集群里的 Service 固定域名后缀（无需变动），8080 是 Service 的端口，它是 Pod 容器组里的应用容器的映射端口。

## 2、创建 Kubernetes Service

接下来，我们需要为每个应用微服务创建相应的 Kubernetes Service，以便它们可以被其他服务通过 DNS 名称访问。这里以 `gcp-user-web` 为例，来看一下怎么创建 Service。

### 创建 gcp-user-web 的 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gcp-user-web
  namespace: gcp
spec:
  selector:
    app: gcp-user-web
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 8080
```

创建好这个 Service 后，其他服务就能通过 `gcp-user-web.gcp.svc.cluster.local:8080` 这个 FQDN 地址（全限定域名地址）来访问它了。

## 3、修改 FeignClient 接口

然后，我们还需要修改代码中 `gcp-feign-service` jar 包里的各个应用微服务的 FeignClient 接口，给 @FeignClient 注解添加 url 属性占位符，并从配置文件里获取对应的值。在配置文件中，我们需要将这些 url 配置项配置成 Kubernetes 的 Service FQDN 地址。

### 修改 FeignClient 接口

```java
@FeignClient(name = "gcp-service-user", url = "${gcp.service.user.url}", fallback = UserFeignServiceFallback.class)
public interface UserFeignService {
    @GetMapping("/users/{id}")
    User getUserById(@PathVariable("id") Long id);
}
```

### Apollo 配置

在 Apollo 配置文件中添加 URL 配置：

```yaml
gcp:
  service:
    user:
      url: http://gcp-user-web.gcp.svc.cluster.local:8080
```

如果有很多个微服务模块都依赖了 gcp-feign-service jar，那这些微服务的 Apollo 配置里，需要把所有 FeignClient 接口类里指定的各个应用微服务的 Kubernetes Service FQDN url 地址，都配上，上面只是演示配了一个 user 微服务的 url，需要注意一下。

## 4、创建 VirtualService

最后，我们需要为每个应用微服务创建 Istio 的 VirtualService。这样每个应用微服务 Pod 容器组里的 `istio-proxy` Sidecar 代理容器就可以解析这个 FQDN，并通过 Istio 进行路由转发和流量管理。

### VirtualService 配置示例

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: gcp-user-web
  namespace: gcp
spec:
  hosts:
  # 这里要写 K8s Service 的 FQDN
  - "gcp-user-web.gcp.svc.cluster.local"
  http:
  - match:
    - uri:
        # 这里的 uri 路径前缀要写成 / 根路径，之前的 Apollo 配置文件里，Spring Cloud Gateway 通过 StripPrefix 也去掉了第一级路径
        prefix: "/"
    route:
    - destination:
        # 因为给当前这个 VirtualService 设置的命名空间是 gcp，下面用 host 字段指定的是 Kubernetes 的 Service 名称，这个 Service 也在 gcp 命名空间里，所以可以简写成 gcp-user-web，不用加 .gcp.svc.cluster.local 后缀
        # 如果 VirtualService 和要路由的目标 Service 不在同一个命名空间，则 host 字段的值要写成 Service 的 FQDN 地址
        host: gcp-user-web
        port:
          # Service 的端口号
          number: 8080
```

## 5、方案对比分析

### 1. **简化服务发现**

Kubernetes 本身自带的 DNS 服务发现机制，使得每个服务都可以通过一个固定的 DNS 名称进行访问。相比于 Consul 需要额外配置和维护，Kubernetes 的方式更加直观和简便。例如，只要我们创建了上文提到的 `gcp-user-web` 服务，其他服务就可以通过 `http://gcp-user-web.gcp.svc.cluster.local:8080` 来访问它，这大大简化了服务之间的通信，也减少了对外部组件的依赖。

### 2. **流量管理和分布式追踪**

Istio 作为成熟且能落地实践的服务网格解决方案，提供了强大的流量管理功能，包括细粒度的流量路由、故障注入（类似于简单的混沌工程）、断路器/熔断器等。通过 Istio，还可以轻松地配置蓝绿部署、金丝雀发布（灰度发布）等高级流量控制策略。此外，Istio 还支持分布式追踪（集成 Jaeger、Zipkin），能帮助我们方便地追踪跨服务的请求路径，快速定位问题。

### 3. **增强的安全性**

Istio 提供服务间的强制双向 TLS（mTLS），来增强交互的安全性。这意味着服务之间的所有通信都是加密的，从而防止了中间人攻击和数据泄露的风险。此外，Istio 还支持细粒度的访问控制策略，比如可以确保只有授权的服务才能进行通信。

### 4. **更好的可观察性**

Istio 提供了丰富的监控和日志功能，能够集成 Prometheus、Grafana 等工具，实现对服务的全面可观察性。通过这些工具，我们可以实时监控服务的运行状态、性能指标以及错误信息，从而快速响应和解决问题。

### 5. **自动化的负载均衡**

Kubernetes 本身就具有强大的负载均衡功能，能够根据服务的运行状况和集群的资源使用情况，自动将请求分发到最合适的实例上。而 Istio 则进一步增强了这一功能，提供了基于权重的流量分配、故障恢复和重试等高级特性，确保我们的服务始终保持高可用性和稳定性。

## 6、结论

通过上面的几个步骤，从外部进入的流量可以成功通过网关微服务对 Kubernetes Service 进行访问，而网关微服务不再需要去请求 Consul 来发现其他应用微服务的地址了。同时，应用微服务之间的相互调用也通过 Istio 进行管理和路由，不再依赖 Consul。这不仅使得服务发现和管理更加高效和统一，也让我们的架构更加现代化了，可以帮助我们更好地构建和维护微服务架构，提升整个系统的稳定性和可维护性。

由此可见，Kubernetes 和 Istio 的组合确实能够替换很多之前流行的 Spring Cloud 微服务组件。比如，Kubernetes 自带的服务发现和 DNS 能完全替代 Spring Cloud 的注册中心（如 Eureka、Zookeeper 等）。Istio 的流量管理功能更加强大，可以实现灵活的服务路由和负载均衡，替代 Spring Cloud Gateway 和 Ribbon。同时，Istio 内置的熔断、重试等功能可以替代 Hystrix 等服务保护工具，而分布式追踪功能则能替代 Sleuth。

至于 Istio 的 IngressGateway，它不仅可以作为流量入口，还提供了丰富的路由和流量控制功能。虽然它与传统的 API 网关有一些不同，传统的 API 网关通常既管理北-南向流量（从外部到内部的流量），也管理东西向流量（服务间流量），但它确实可以承担大部分 API 网关的职责，特别是在处理北-南向的流量方面，而 Istio 的 Sidecar 代理和其他组件则更擅长管理东西向流量，这样就会更加分工明确一些。