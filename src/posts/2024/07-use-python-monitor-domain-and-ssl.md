# 使用 Python 脚本监控域名和 SSL 证书的有效期

## Python 代码

```python
import ssl
import socket
from datetime import datetime, timedelta, timezone
import whois
import requests

# 在日志文件的开头记录当前时间
print("脚本执行的时间：", datetime.now())

# 获取 SSL 证书有效期
def get_ssl_expiry_date(domain):
    # 分离域名和端口
    domain_name, sep, port = domain.partition(':')
    if not port:
        port = 443
    else:
        port = int(port)

    ssl_date_fmt = r'%b %d %H:%M:%S %Y %Z'
    context = ssl.create_default_context()
    conn = context.wrap_socket(
        socket.socket(socket.AF_INET),
        server_hostname=domain_name,
    )
    conn.settimeout(3.0)

    try:
        conn.connect((domain_name, port))
        ssl_info = conn.getpeercert()
        ssl_expiry_date = datetime.strptime(ssl_info['notAfter'], ssl_date_fmt)
        # 将 UTC 时间转换为 CST 时间
        cst_timezone = timezone(timedelta(hours=8))
        ssl_expiry_date = ssl_expiry_date.replace(tzinfo=timezone.utc).astimezone(cst_timezone)
    except (socket.timeout, socket.gaierror) as e:
        print(f"无法连接到 {domain_name}。错误: {e}")
        return None
    except Exception as e:
        print(f"无法获取 {domain_name} 的 SSL 证书有效期。错误: {e}")
        return None
    finally:
        conn.close()

    return ssl_expiry_date

# 获取域名有效期
def get_domain_expiry_date(domain: str) -> datetime:
    # 分离域名和端口
    domain_name, sep, port = domain.partition(':')

    w = whois.whois(domain_name)
    if w.status == None:
        print(f"无法获取 {domain_name} 的 whois 数据。")
        return None

    domain_endings = ['.com', '.org.cn', '.com.cn', '.cn', '.edu.cn', '.info', ',net', '.org']
    # 获取域名后缀
    domain_ending = next((de for de in domain_endings if domain.endswith(de)), None)

    if domain_ending:
        if type(w.expiration_date) == list:
            domain_expiry_date = w.expiration_date[0]
        else:
            domain_expiry_date = w.expiration_date
    else:
        print(f"不支持的域名后缀: {domain}")
        return None

    return domain_expiry_date

# 发送企业微信群机器人消息
def send_wechat_message(domain, msg_type, expiry_date, project_name):
    # 换成你自己的 Webhook 地址，注意保密！
    webhook_url = 'XXXX'
    headers = {"Content-Type": "application/json"}
    expiry_date_str = expiry_date.strftime('%Y-%m-%d %H:%M:%S')
    data = {
        "msgtype": "markdown",
        "markdown": {
            "content": f"{project_name} {domain} 的 {msg_type} 即将过期，请及时联系相关方进行续费。\n"
                      f">类型：<font color=\"warning\">{msg_type}</font>\n"
                      f">过期时间：<font color=\"warning\">{expiry_date_str}</font>"
        }
    }
    response = requests.post(webhook_url, json=data, headers=headers)
    if response.status_code == 200:
        print(f"{domain} 的 {msg_type} 的消息已成功发送到企业微信群。")
    else:
        print(f"发送 {domain} 的 {msg_type} 的消息到企业微信群失败。 "
              f"企业微信群机器人 API 返回: {response.text}")

# 检查域名和 SSL 证书有效期
def check_domain_and_ssl_expiry(domains: list):
    cst_timezone = timezone(timedelta(hours=8))
    now = datetime.now().astimezone(cst_timezone)
    one_month_later = now + timedelta(days=30)

    for item in domains:
        project_name, domain = item.split('|')

        domain_expiry_date = get_domain_expiry_date(domain)
        ssl_expiry_date = get_ssl_expiry_date(domain)

        print(f"项目名称: {project_name}")
        print(f"域名: {domain}")
        print(f"域名有效期: {domain_expiry_date}")
        print(f"SSL 证书有效期: {ssl_expiry_date}")

        if domain_expiry_date:
            domain_expiry_date = domain_expiry_date.replace(tzinfo=cst_timezone)
            if domain_expiry_date < now:
                print("域名已过期!")
            else:
                print("域名有效。")

                if domain_expiry_date and domain_expiry_date < one_month_later:
                    send_wechat_message(domain, '域名', domain_expiry_date, project_name)
        else:
            print("无法获取域名有效期。")

        if ssl_expiry_date and ssl_expiry_date < now:
            print("SSL 证书已过期!")
        else:
            print("SSL 证书有效。")

            if ssl_expiry_date and ssl_expiry_date < one_month_later:
                send_wechat_message(domain, 'SSL 证书', ssl_expiry_date, project_name)
        print("\n")

# 从同目录下的 domains.txt 文件里读取域名，一行一个
with open('domains.txt', 'r') as f:
    domains = [line.strip() for line in f if line.strip()]

# 调用检查域名和 SSL 证书有效期的函数
check_domain_and_ssl_expiry(domains)
```

domain.txt 文件内容示例如下——

**你的项目名称|www.yourdomain.com**

**你的项目名称|www.yourdomain.com:8443**

## 注意点

1. 脚本使用 Python3 版本，不要使用 Python2，可能会不兼容

2. 安装 Python3 后，需要用 pip3 手动安装不在标准库里的 requests 和 whois 库，命令是 **pip3 install python-whois requests**，python3 和 pip3 在安装好 Python3 后，一般会被自动添加到环境变量里，可以直接调用

3. 这个 domains.txt 文件里的每一行内容，格式为`项目名|域名`，域名里不包含 Scheme 协议头，但可以包含非 443 端口，不含端口的域名就表示默认使用 443 端口，注意分隔符是英文的 **|** 竖线