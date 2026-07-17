// ---- System tools ----

const get_system_resources = {
  type: "function",
  function: {
    name: "get_system_resources",
    description: "获取当前系统资源状态，包括 CPU 使用率、内存占用、进程数量、可见窗口列表和内存占用最高的进程。不需要任何参数。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

const get_disk_space = {
  type: "function",
  function: {
    name: "get_disk_space",
    description: "查询指定盘符的磁盘空间。返回总容量、已用空间、剩余空间和使用率。盘符为单个字母，如 C、D。",
    parameters: {
      type: "object",
      properties: {
        drive: {
          type: "string",
          description: "要查询的盘符字母，如 C、D、E。默认为 D。"
        }
      },
      required: ["drive"]
    }
  }
};

const check_process_running = {
  type: "function",
  function: {
    name: "check_process_running",
    description: "检查某个应用或进程是否正在运行。输入应用名称（如 QQ、微信、Chrome、VS Code 等），返回该应用是否在运行以及匹配到的进程信息。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要检查的应用名称，如 QQ、微信、Chrome、VS Code、网易云音乐等。"
        }
      },
      required: ["name"]
    }
  }
};

const kill_process = {
  type: "function",
  function: {
    name: "kill_process",
    description: "终止一个正在运行的进程。可以传入进程名称（如 cloudmusic.exe、QQ.exe）或进程 PID。⚠️ 此操作不可逆，调用前必须先向用户确认要终止哪个进程。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要终止的进程名称或 PID。进程名如 cloudmusic.exe、QQ.exe、WeChat.exe，PID 如 34252。"
        }
      },
      required: ["name"]
    }
  }
};

const list_running_apps = {
  type: "function",
  function: {
    name: "list_running_apps",
    description: "列出当前所有可见窗口的应用。返回带窗口标题的前台应用列表，用于了解用户当前打开了哪些程序。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

// ---- App tools ----

const launch_application = {
  type: "function",
  function: {
    name: "launch_application",
    description: "启动一个应用。可以传入应用名称（如 QQ、微信、Chrome、VS Code、记事本、网易云音乐）或可执行文件路径。启动成功后会返回启动方式和进程 PID。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要启动的应用名称或可执行文件完整路径。支持常用中文名如'QQ'、'微信'、'记事本'、'画图'、'网易云音乐'、'Edge浏览器'、'Chrome'、'VS Code'等。"
        }
      },
      required: ["name"]
    }
  }
};

const find_application = {
  type: "function",
  function: {
    name: "find_application",
    description: "查找某个应用的安装入口，包括开始菜单 AppID、安装位置、快捷方式路径等。适用于想知道应用装在哪里的场景。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要查找的应用名称，如 QQ、微信、Edge、Chrome、VS Code 等。"
        }
      },
      required: ["name"]
    }
  }
};

const refresh_app_registry = {
  type: "function",
  function: {
    name: "refresh_app_registry",
    description: "刷新本机应用注册表缓存。重新扫描系统中的已安装应用、开始菜单条目和快捷方式，更新本地应用索引。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

// ---- File tools ----

const list_directory = {
  type: "function",
  function: {
    name: "list_directory",
    description: "列出指定目录下的文件和文件夹。支持中文路径别名：桌面、文档、下载、D盘，也支持完整路径。返回目录中的项目列表。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要列出的目录路径。可以是完整路径（如 C:\\Users\\xxx\\Desktop），也可以是中文名（桌面、文档、下载、D盘、用户目录）。"
        }
      },
      required: ["path"]
    }
  }
};

const read_text_file = {
  type: "function",
  function: {
    name: "read_text_file",
    description: "读取一个文本文件的内容。支持 .txt、.md、.json、.js、.ts、.py、.html、.css 等文本格式。返回文件的前 2400 个字符。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要读取的文件完整路径，如 C:\\Users\\xxx\\Documents\\notes.md。"
        }
      },
      required: ["path"]
    }
  }
};

const open_file_or_folder = {
  type: "function",
  function: {
    name: "open_file_or_folder",
    description: "在文件资源管理器中打开一个文件或文件夹。支持中文路径别名。打开文件夹会在新的资源管理器窗口中显示，打开文件会用默认程序打开。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要打开的文件或文件夹路径。支持中文名：桌面、文档、下载、D盘。"
        }
      },
      required: ["path"]
    }
  }
};

const create_folder = {
  type: "function",
  function: {
    name: "create_folder",
    description: "创建一个新文件夹。会自动创建所有不存在的父目录。支持中文路径别名。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要创建的文件夹完整路径，如 C:\\Users\\xxx\\Desktop\\新建文件夹。支持在中文名后拼接：桌面\\新项目。"
        }
      },
      required: ["path"]
    }
  }
};

const create_text_file = {
  type: "function",
  function: {
    name: "create_text_file",
    description: "创建一个新的空文本文件。如果文件已存在则不做任何操作。支持中文路径别名。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要创建的文件完整路径，如 C:\\Users\\xxx\\Desktop\\笔记.txt。支持在中文名后拼接：桌面\\readme.md。"
        }
      },
      required: ["path"]
    }
  }
};

const append_to_file = {
  type: "function",
  function: {
    name: "append_to_file",
    description: "向一个文本文件末尾追加写入内容。会自动创建不存在的父目录。用于记录笔记、追加日志等场景。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "目标文件的完整路径。"
        },
        content: {
          type: "string",
          description: "要追加写入的文本内容。"
        }
      },
      required: ["path", "content"]
    }
  }
};

const delete_file_or_folder = {
  type: "function",
  function: {
    name: "delete_file_or_folder",
    description: "删除一个文件或文件夹。⚠️ 此操作不可逆，删除前必须先向用户确认路径和内容。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要删除的文件或文件夹完整路径。"
        }
      },
      required: ["path"]
    }
  }
};

const search_files = {
  type: "function",
  function: {
    name: "search_files",
    description: "在桌面、文档、下载和 D 盘根目录中搜索文件名包含指定关键词的文件和文件夹。返回最多 30 条匹配结果。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "文件名关键词，支持部分匹配。如搜索'预算'可能匹配到'2026预算.xlsx'。"
        }
      },
      required: ["query"]
    }
  }
};

// ---- RAG / Knowledge tools ----

const search_knowledge_base = {
  type: "function",
  function: {
    name: "search_knowledge_base",
    description: "检索本地知识库中与查询相关的内容片段。适用于查找用户的笔记、文档、设定等本地存储的知识。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "要在知识库中搜索的关键词或问题。"
        }
      },
      required: ["query"]
    }
  }
};

const get_rag_status = {
  type: "function",
  function: {
    name: "get_rag_status",
    description: "查询本地知识库索引的状态，包括已索引的文件数量、片段数量以及最近更新时间。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

const rebuild_rag_index = {
  type: "function",
  function: {
    name: "rebuild_rag_index",
    description: "重建本地知识库索引。扫描知识库目录中的所有文件，重新切分片段并建立索引。适用于添加了新知识文件后需要更新的场景。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

// ---- Workspace tools ----

const list_workspace = {
  type: "function",
  function: {
    name: "list_workspace",
    description: "列出当前工作目录或指定目录的内容。适用于查看项目结构、了解工作目录中的文件和子目录。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "可选。要查看的目录路径。不传则使用当前工作目录。"
        }
      },
      required: []
    }
  }
};

const switch_workspace = {
  type: "function",
  function: {
    name: "switch_workspace",
    description: "切换工作目录到指定路径。后续的文件操作和代码操作都将基于这个目录进行。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要切换到的目录路径。"
        }
      },
      required: ["path"]
    }
  }
};

// ---- Mood tool (LLM must call this each turn) ----

const set_mood = {
  type: "function",
  function: {
    name: "set_mood",
    description: "每轮对话结束时必须调用。设置桌宠情绪和面部动作。",
    parameters: {
      type: "object",
      properties: {
        mood: {
          type: "string",
          enum: ["happy", "sad", "surprised", "angry", "blush", "thinking"],
          description: "情绪：happy=开心,sad=难过,surprised=惊讶,angry=生气,blush=害羞,thinking=思考"
        },
        face_params: {
          type: "object",
          description: "可选。控制面部细节，参数名和有效值参考知识库 expressions.md。示例：{\"Param70\":1} 吐舌，{\"ParamMouthForm\":0.4,\"ParamAngleZ\":8} 微笑歪头。不要将参数名写进对话文本。"
        }
      },
      required: ["mood"]
    }
  }
};

// ---- All tools array ----

export const ALL_TOOLS = [
  // System
  get_system_resources,
  get_disk_space,
  check_process_running,
  kill_process,
  list_running_apps,
  // App
  launch_application,
  find_application,
  refresh_app_registry,
  // File
  list_directory,
  read_text_file,
  open_file_or_folder,
  create_folder,
  create_text_file,
  append_to_file,
  delete_file_or_folder,
  search_files,
  // RAG
  search_knowledge_base,
  get_rag_status,
  rebuild_rag_index,
  // Workspace
  list_workspace,
  switch_workspace,
  // Mood
  set_mood
];
