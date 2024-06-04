## 使用 Kubernetes 和 Helm Chart 部署和管理微服务

### 引言

嘿，大家好！今天我们来聊聊如何使用 Kubernetes 和 Helm Chart 来部署和管理微服务。

随着微服务架构的流行与实践，生产环境中运行的微服务容器也越来越多，使用传统的 shell 脚本或 Docker Compose 来部署应用变得越来越不方便，我们迫切需要一些强大的工具来简化这些应用容器的管理。因此，Kubernetes 就成了必然的选择，毕竟 Kubernetes 已经成为了容器编排事实上的标准。

相信大家基本上都听过或者用过 Kubernetes 了，知道它是一个非常流行的容器编排平台，而 Helm Chart，则是它的包管理工具，类似于 Linux 服务器上常见的 APT、YUM，以及 Mac 电脑上的 Homebrew 等包管理工具，主要用来自动化管理软件依赖和安装/升级/卸载软件，只不过 Helm Chart 是专门用来管理用在 Kubernetes 集群里的软件包的。

本文会简单介绍一下这些工具，并展示如何利用它们来提高开发效率。内容粗略，仅做参考。

### 什么是 Kubernetes？

Kubernetes，简称 K8s，是一个**开源的**容器编排（Orchestrator）平台，用来管理那些分布在多个服务器节点上的容器。它能自动处理容器的部署、扩展和管理，还能实现负载均衡、故障恢复、滚动更新等功能。

#### Kubernetes 的核心组件

![Kubernetes 组件](/uploads/components-of-kubernetes.png)

- **API 服务器 (kube-apiserver)**：接收客户端的请求，并与集群中的其他组件通信，是 Kubernetes 控制平面（Control Plane）的前端。
- **调度器 (kube-scheduler)**：监控新创建的容器，并基于多种策略，决定将它们放在哪个服务器节点上运行。
- **控制器管理器 (kube-controller-manager)**：管理集群（资源）的状态，比如节点、容器编排、故障恢复等。它包含了多个控制器，例如节点（Node）控制器、复制（Replica）控制器、端点（Endpoint）控制器等。
- **etcd**：一个分布式的、可靠的、持久化键值（key-value）存储组件，用于保存集群的配置信息和状态数据，相当于是一个“数据库”。
- **kubelet**：运行在每个服务器节点上的代理程序，用于管理该节点上的容器。它会确保容器按照定义的 Pod 规范来运行。
- **kube-proxy**：实现服务（Service，这个和我们平时说的服务不太一样，要注意下）的网络代理和负载均衡，负责 Pod 之间的网络通信。
- **容器运行时 (Container Runtime)**：实际运行容器的组件，如 Docker、containerd 或 CRI-O。

这些组件一起工作，让 Kubernetes 可以轻松管理**成千上万个**容器，并确保它们始终按照我们期望的状态良好运行。

#### Kubernetes 中常见的资源类型

- **Pod（容器组）**：Kubernetes 中的最小部署单元，通常包含一个或多个容器，具有共享的存储、网络和配置。
- **Service（服务）**：定义了一组 Pod 的逻辑集合，并提供一个稳定的访问入口（IP 地址和端口），即使 Pod 在重启或移动时也不会改变。访问 Service 就会访问到后端的 Pod 容器组，Service 有点像虚拟 IP 的概念，只不过它能自动处理和 Pod 容器组的绑定，对Service 的调用者来说是透明的，调用者不需要关心 Service 是怎么和 Pod 绑定的。
- **Deployment（部署）**：最常见的一种工作负载（Workload）类型，用于管理 Pod 的副本集和更新策略，确保应用的高可用性和可扩展性。
- **StatefulSet（有状态副本集）**：另一种工作负载（Workload）类型，用于部署有状态的应用（比如数据库与中间件这一类应用），保证 Pod 的顺序启动和数据持久化存储。
- **DaemonSet（守护进程集）**：工作负载类型之一，确保所有或某些节点上运行一个 Pod 的副本，常用于日志收集和指标监控。
- **Job（任务）**：工作负载类型之一，是一次性的任务，完成即退出，用于确保指定数量的 Pod 成功执行/结束某种任务，如数据迁移类任务。
- **CronJob（定时任务）**：工作负载类型之一，是周期性的任务，按照预定的时间计划，定时调度并运行 Job。

#### Kubernetes 中的 API 相关概念

- **API 资源**：Kubernetes 中的所有对象（如 Pod、Service 等）都是 API 资源，可以通过 REST API 进行操作。
- **API 版本**：为了兼容性，Kubernetes 提供多个 API 版本，如 v1、v1beta1。通常，稳定的资源使用 v1 版本。
- **自定义资源 (CRD)**：允许用户定义自己的资源类型，扩展 Kubernetes API，用于实现特定的业务需求。
- **控制器和操作符**：控制器是用于管理资源状态的程序，而操作符（Operator）是控制器的一个特定实现，用于管理复杂的应用程序生命周期。

### 什么是 Helm Chart？

Helm 是适用于 Kubernetes 集群的包管理工具，它用 Helm Chart（Chart 可以翻译成图表文件或模板文件）来定义、安装和管理 Kubernetes 应用。Helm Chart 就像一个打包好的应用模板，可以帮我们简化和自动化 K8s 集群应用的部署。Helm 的主要组件包括：

- **Helm 客户端**：提供命令行工具，用于创建、打包、配置和管理（推送和拉取） Helm Chart。
- **Chart 仓库**：存储和分发 Helm Chart 的地方，可以是公共的，也可以是私有的，比如我们自行搭建的 Harbor Registry 镜像仓库就可以用来存储 Helm Chart 包，达到用一个 Registry 既能存储 Docker Image 也能存储 Helm Chart 的效果。

有了 Helm，就可以轻松地将复杂的 Kubernetes 应用打包成一个 Chart 包，并进行安装、更新、版本控制和复用了。

#### Helm 图表的主要组成部分包括如下

1. **Chart.yaml**：定义图表的基本信息元数据，如名称、版本、描述等。
2. **values.yaml**：包含用户可自定义的配置值，通过该文件可以覆盖默认配置，这个文件最为重要。
3. **templates/**：存放所有 Kubernetes 资源的模板文件，这些模板文件使用 Go 模板语言编写，里面基本上都是一些变量占位符，它可以根据 `values.yaml` 和 `_helpers.tpl` 中的值进行动态渲染。
4. **charts/**：存放依赖的子图表，一般不怎么用，否则可能会加大复杂度。
5. **templates/_helpers.tpl**：存放模板的辅助函数，可以在其他模板文件中引用。

以下是一个简单的 Helm Chart 的目录结构示例：

```
mychart/
  Chart.yaml
  values.yaml
  charts/
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
    serviceaccount.yaml
    _helpers.tpl
```

### 部署微服务

#### 1. 创建 Kubernetes 集群

首先，我们需要一个部署 Kubernetes 集群。可以使用本地安装的 Minikube，或者云服务商的 Kubernetes 相关产品来创建集群。以下是 [使用 Minikube 创建本地 Kubernetes 集群](https://kubernetes.io/zh-cn/docs/tutorials/hello-minikube/#create-a-minikube-cluster) 的示例：

```sh
minikube start
```

这样，Minikube 会在本地启动一个单节点的 Kubernetes 集群，非常适合开发和测试使用。

#### 2. 编写 Dockerfile

接下来，为每个微服务编写 Dockerfile，将应用程序打包成容器镜像。以下是一个简单的 Node.js 应用的 Dockerfile 示例：

```Dockerfile
FROM node:14
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "app.js"]
EXPOSE 3000
```

这个 Dockerfile 使用 Node.js 官方镜像，复制应用代码到容器中，安装依赖并启动应用，并确保应用在 Dockerfile 中正确暴露端口。

#### 3. 构建和推送 Docker 镜像

使用 Docker 构建镜像并推送到镜像仓库（如 Docker Hub 或私有的 Harbor Registry 仓库，推送之前需要先用 docker login 命令进行登录，并确保有权限），示例如下：

```sh
# 推送到 Docker Hub
docker build -t username/myapp:latest .
docker push username/myapp:latest
```

或

```sh
# 推送到 Harbor Registry
docker build -t projectname/myapp:latest .
docker push projectname/myapp:latest
```
构建完成后，镜像会被推送到仓库，方便 Kubernetes 拉取和部署。

#### 4. 编写 Kubernetes 部署文件

为每个微服务创建 Kubernetes 部署文件（YAML 格式）。以下是一个简单的 Deployment 和 Service 示例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: username/myapp:latest
        ports:
        - containerPort: 3000

---
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
  - port: 3000
    targetPort: 3000
    nodePort: 30001
```

Deployment 资源的配置文件里定义了微服务的副本数（replicas 字段）、镜像（image 字段）和端口（containerPort 字段）信息，Service 资源的配置文件里则为那个 Deployment 微服务提供了稳定的访问地址和端口。具体来说，因为 Service 的 type 类型字段的值是 NodePort，那在集群外部就可以通过 http://集群内任一服务器节点的ip地址:30001 这个地址来访问。

将这个文件保存为 `myapp-deployment.yaml`，然后应用到 Kubernetes 集群中（要说明一下，下面的 kubectl 命令里都没有用 -n 选项来指定命名空间，不指定的话，Kubernetes 默认会使用自带的、名为 **default** 的命名空间）：

```sh
kubectl apply -f myapp-deployment.yaml
```

这会在集群中的 default 命名空间下创建 Deployment 和 Service，并启动微服务实例。

### 使用 Helm Chart 部署微服务

#### 1. 创建 Helm Chart

建议在源码的相关目录下，使用 Helm 命令行创建一个新的 Chart，便于对 Helm Chart 图表文件进行版本化管理：

```sh
helm create mychart
```

Helm 会在当前目录下生成一个包含预定义模板的目录结构。我们可以在 `mychart/templates` 目录下修改和添加 Kubernetes 资源定义文件，如 `deployment.yaml`、`service.yaml` 等。

#### 2. 编辑 `values.yaml`

`values.yaml` 文件用于定义 templates 目录下的各类资源模板中要引用到的变量。比如可以修改 `values.yaml` 如下所示：

```yaml
# 指定副本集数量
replicaCount: 3

image:
  # 指定 Docker 镜像 repository
  repository: username/myapp
  # 指定 Docker 镜像的标签
  tag: latest
  # 指定镜像的拉取策略，IfNotPresent 表示本地不存在的话就拉取，还有 Always 选项表示始终去拉取
  pullPolicy: IfNotPresent

service:
  # 指定 service 的类型
  type: NodePort
  # 指定 service 的端口
  port: 80
  # 如果类型是 NodePort，还需要指定 nodePort（即节点端口）
  nodePort: 30001

ingress:
  # 设置是否启用 ingress
  enabled: true
  # 指定使用的 ingress 类名，通常使用 Nginx 类型的 Ingress，className 就填 nginx
  className: ""
  annotations:
    # 让 nginx ingress 重写 URL 路径，可以使用 $1、$2 这种 nginx 里面的捕获组变量
    nginx.ingress.kubernetes.io/rewrite-target: /
  hosts:
    # 配置域名
    - host: myapp.local
      paths:
        # 配置路径，可以配多个，如果 pathType 是 ImplementationSpecific，path 里可以用正则表达式
        - path: /
          # 配置路径类型，比如精确匹配、前缀匹配、由控制器提供方决定如何匹配（即下方的 ImplementationSpecific）
          pathType: ImplementationSpecific
```

`values.yaml` 文件定义了镜像信息、服务类型、端口配置以及 Ingress 规则。通过修改这些变量，可以轻松地调整应用的部署配置。

#### 3. 安装 Chart

使用 `helm install` 命令或 `helm upgrade --install` 命令安装/更新安装 Chart：

```sh
helm install myapp ./mychart
```

这会根据 `values.yaml` 文件生成 Kubernetes 资源，并在集群中部署应用。

也可以在本地打包 Chart 并推送到 Harbor Registry 里，推送前需要先 docker login，并确保账号有权限上传 helm chart 文件。

```sh
# 在 Chart.yaml 文件所在的目录下执行下面的命令，-d . 表示将打出来的 tgz 压缩包保存在当前目录下
helm package . -d .
```

```sh
# 需要修改成你自己的 Helm Chart 包名、Harbor Registry 仓库地址和项目名
# oci:// 表示是兼容 OCI（开放容器计划）的仓库，Harbor v2 及以上的版本兼容 OCI，因此可以把 Helm Chart 包推送到 Harbor Registry 里
helm push your-chart-name.tgz oci://your-harbor-registry/your-project
```

以上相关操作，也可以在 Jenkins 服务器上完成，这样就可以**实现在 Jenkins pipeline 流水线中自动并持续部署应用到 K8s 集群里**的能力，提高了研发和交付效率，示例代码如下：

```groovy
// 定义一个推送 Helm Chart 包的函数
def pushHelmChart(String chartPackage, String registryURL, String projectName, String credentialsId) {
    try {
        // 登录到 Harbor 并推送 Helm Chart 包
        withCredentials([usernamePassword(credentialsId: credentialsId, passwordVariable: 'password', usernameVariable: 'username')]) {
            echo '登录到 Harbor 并推送 Helm Chart 包'
            sh "helm registry login --username=${username} --password=${password} ${registryURL}"
            sh "helm push ${chartPackage} oci://${registryURL}/${projectName}"
        }
    } catch (Exception e) {
        echo "发生错误: ${e.getMessage()}"
        // 处理错误，发送通知、标记构建失败等
        currentBuild.result = 'FAILURE'
        sh "sudo /home/ucmed/jenkins-script/qywx-remind.sh ${env.HOOK_ID} '构建失败: ${e.getMessage()}'"
        throw e  // 重新抛出异常，确保 Jenkins 标记这次构建为失败
    }
}

…

// 调用 pushHelmChart 函数
pushHelmChart("${projectName}/chart/${chartPackage}", env.YOUR_HARBOR_URL, env.YOUR_PROJECT_NAME, env.YOUR_HARBOR_AUTH)

// 部署到 K8s，并重启 Deployment
sh "helm upgrade --install ${helmReleaseName} ${projectName}/chart -n your-namespace && kubectl rollout restart deployment/${helmReleaseName} -n your-namespace"

…

```

### 配置 Ingress

为了使外部流量能够访问到集群内部的服务，我们还需要配置一下 Ingress 资源。集群外部可以安装一个 Nginx（或者云服务商的 Load Balancer 负载均衡器），配置 SSL 并转发根路径到集群里的 Ingress 通过 NodePort 类型的 Service 暴露出来的 http 协议端点地址即可，其他具体路径的转发及相关安全和性能方面的配置，都交给集群里的 Ingress 来处理。以下是一个简单的 Ingress 配置示例：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: ImplementationSpecific
        backend:
          service:
            # 意思是把访问 myapp.local 域名 / 根路径的流量，转发到名为 myapp 的这个 service 以及它的 80 端口上去
            name: myapp
            port:
              number: 80
```

将该文件保存为 `myapp-ingress.yaml` 并应用：

```sh
kubectl apply -f myapp-ingress.yaml
```

这个 Ingress 规则会将 `myapp.local` 域名下的所有请求转发到 `myapp` 服务的 80 端口。

下面是我的集群里创建的一些 ingress 资源：

```sh
# kubectl get ingress -A
NAMESPACE    NAME            CLASS   HOSTS               ADDRESS                     PORTS   AGE
gcp          gcp-gateway     nginx   verify.ctrial.com   192.168.4.45,192.168.4.46   80      22h
gcp          gcp-web-admin   nginx   verify.ctrial.com   192.168.4.45,192.168.4.46   80      22h
gcp          gcp-web-pc      nginx   verify.ctrial.com   192.168.4.45,192.168.4.46   80      22h
gcp          gcp-web-wap     nginx   verify.ctrial.com   192.168.4.45,192.168.4.46   80      23h
usercenter   ucd             nginx   verify.ctrial.com   192.168.4.45,192.168.4.46   80      6h15m
```

### Kubernetes 和 Helm 的配合使用

Kubernetes 和 Helm 作为现代 DevOps 工具链中的核心组件，它们的强大之处在于它们的灵活性和扩展性。通过结合使用这两者，我们可以实现更复杂的部署场景和管理策略。

#### 动态配置和环境管理

可以为不同的环境，使用不同的 values.yaml 文件（类似于 Spring Boot 的 Profile），无需修改模板文件。例如，可以为不同环境设置不同的副本数量、资源限制和环境变量，然后通过 `helm install --values values-production.yaml` 来应用生产环境的配置，而开发环境则可以使用 `helm install --values values-dev.yaml`，非常灵活。

#### 滚动更新和回滚

Kubernetes 支持滚动更新，这意味着我们可以在不中断服务的情况下更新应用。Helm 在此基础上更进一步，提供了版本控制和回滚功能。每次使用 Helm 更新应用时，都会生成一个新版本（版本信息存放在 secret 里，格式类似于 `sh.helm.release.v1.gcp-project.v1` 这样）。如果 Helm 在更新过程中出现问题，可以方便地回滚到之前的版本：

```sh
helm upgrade myapp ./mychart
# 如果出现问题，回滚到上一个版本
helm rollback myapp
# 回滚到指定版本，如回滚到 v1，就写 1
helm rollback myapp 1
```
#### Helm 的强大生态

Helm 拥有丰富的官方 Chart 仓库和社区维护的 Chart 仓库，涵盖了常见的数据库、中间件、应用框架等，极大地简化了应用的部署和运维，比如用 Helm 安装 ES：

```sh
# 通过 helm 将 ES 安装到集群的 middleware 命名空间里
helm install elasticsearch elastic/elasticsearch --version 7.8.1 --namespace middleware
```

或

```sh
# 使用自定义的 values.yaml 安装 ES 到集群的 middleware 命名空间里，在自定义的 values.yaml 文件里可以指定 ES 使用的实际存储类等信息
helm install elasticsearch elastic/elasticsearch --version 7.8.1 --namespace middleware -f values.yaml
```


### 小结

Helm Chart 使得部署过程变得更加可重复和可移植，Kubernetes 则提供了强大的资源管理能力和容器编排能力，能最大程度地确保应用程序在生产环境中的高可用性和可扩展性。

通过 Kubernetes 和 Helm Chart，我们可以轻松地部署和管理微服务应用。这种方法不仅提高了部署效率，还简化了应用程序的扩展和维护问题，可以说是 **“工欲善其事，必先利其器”** 的典范了。