# 本地 Neo4j

通过 Docker Desktop 运行 Neo4j 5.26.32 Community，启用 APOC Core。镜像在 `compose.neo4j.yaml` 中锁定版本及摘要，使用 Apple Silicon 原生镜像。

## 连接

- Browser：<http://localhost:7474/browser/>
- Bolt：`bolt://127.0.0.1:7687`
- 用户名：`saul`
- 数据库：`neo4j`
- 连接配置和当前密码：`.ai-novel/neo4j/connection.env`

连接文件权限为 `600`，其目录已被项目 `.gitignore` 排除。后续 Graphiti 服务可读取其中的 `NEO4J_URI`、`NEO4J_USER`、`NEO4J_PASSWORD` 和 `NEO4J_DATABASE`。浏览器登录时使用文件中的密码。

当前数据库用户已按用户要求从 `neo4j` 重命名为 `saul`，密码已更新；Compose 将最小密码长度设置为 6，并使用连接文件中的用户名执行健康检查。

端口只绑定本机 `127.0.0.1`。Java 初始堆 512 MiB、最大堆 1 GiB，page cache 为 512 MiB。Neo4j 的总内存还包括堆外开销。

## 启停与检查

以下命令在项目根目录执行，需要 Docker Desktop 正在运行。

```bash
# 启动；再次执行会复用现有服务与数据
docker compose --env-file .ai-novel/neo4j/connection.env -f compose.neo4j.yaml up -d

# 状态，正常应显示 healthy
docker compose --env-file .ai-novel/neo4j/connection.env -f compose.neo4j.yaml ps

# 查看最近日志
docker compose --env-file .ai-novel/neo4j/connection.env -f compose.neo4j.yaml logs --tail 60 neo4j

# 停止，保留数据
docker compose --env-file .ai-novel/neo4j/connection.env -f compose.neo4j.yaml stop

# 重新启动
docker compose --env-file .ai-novel/neo4j/connection.env -f compose.neo4j.yaml restart neo4j
```

在 Browser 中可以执行：

```cypher
CALL dbms.components() YIELD name, versions, edition
RETURN name, versions, edition;

RETURN apoc.version();

SHOW DATABASES;
```

## 持久化

Docker 命名卷：

- `ai-novel-neo4j-data`：数据库及认证信息。
- `ai-novel-neo4j-logs`：日志。
- `ai-novel-neo4j-plugins`：APOC 插件。

这些卷位于 Docker Desktop 的存储中，不在小说存档目录。停止或重建容器会保留命名卷；备份小说 `.ai-novel` 目录不会备份数据库，需要另行备份图数据。不要在需要保留数据时执行带 `--volumes` / `-v` 的 Compose 删除命令。

容器设置为 `restart: unless-stopped`：Docker 启动后会恢复此前运行的服务；若手动停止，需要再次执行启动命令。Docker Desktop 是否随登录启动，取决于它自己的设置。

`NEO4J_AUTH` 负责新数据目录的初始化，官方容器的初始用户名仍为 `neo4j`；当前持久化卷中的用户已重命名为 `saul`。若从全新空卷部署，需要重新执行用户名变更。数据库已有数据后，直接改连接文件里的密码不会更改数据库用户密码；修改密码时需要同时更新数据库用户和连接配置，再执行 `up -d` 让健康检查使用新凭据。

Graphiti 的服务、图 schema 和小说记忆同步现已接入，见 [Graphiti 使用说明](graphiti-memory.md)。

2026-10-14 已验证：容器健康检查、认证读写、中文节点及关系、APOC 函数、向量查询过程、Browser HTTP、本机 Bolt 端口，以及重启后数据保留。验证节点已清理。结果记录在 `.ai-novel/neo4j/deployment-verification.json`。

参考：[Graphiti 的 Neo4j 配置](https://help.getzep.com/graphiti/configuration/neo4j-configuration)、[官方 Docker 插件配置](https://neo4j.com/docs/operations-manual/current/docker/plugins/)。
