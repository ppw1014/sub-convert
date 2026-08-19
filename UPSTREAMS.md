# 上游来源

本仓库将四个原本独立的浅克隆仓库合并为一个部署用 monorepo。下表记录合并时的上游基线，便于后续拉取补丁或比较差异。

| 目录 | 上游仓库 | 分支 | 基线 commit |
| --- | --- | --- | --- |
| `subweb` | `https://github.com/stilleshan/subweb.git` | `main` | `8739041259f5db471d1cc40e2907e6526f00b9be` |
| `subconverter` | `https://github.com/stilleshan/subconverter.git` | `master` | `34bccbcee36540b02581f2e64c394e4b5858a810` |
| `tindy-subconverter` | `https://github.com/tindy2013/subconverter.git` | `master` | `5b8d3af0d7b659e3ff6029560e4a6811538a9c21` |
| `dockerfiles` | `https://github.com/stilleshan/dockerfiles.git` | `main` | `c16f1661404409b4805067bf1b4b21e4a56f763c` |

后续同步上游时，应在临时目录克隆对应仓库，再把需要的 commit 或文件变更移入本仓库。不要在这些目录中重新初始化嵌套 Git 仓库。
