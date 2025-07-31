const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { Client } = require('ssh2')

// SSH 连接管理
const sshConnections = new Map()

// 通过 window 对象向渲染进程注入 nodejs 能力
console.log('🔧 services.js 开始加载...')

// 检查 uTools 环境
if (!window.utools) {
  console.error('❌ uTools 环境未检测到')
} else {
  console.log('✅ uTools 环境检测成功')
}

window.services = {
  // 文件操作
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  writeTextFile (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },

  // SSH Agent 诊断工具
  sshAgent: {
    // 获取当前插件环境的SSH Agent信息
    getCurrentAgentInfo () {
      const sshAuthSock = process.env.SSH_AUTH_SOCK
      const defaultAgentPath = path.join(os.homedir(), 'Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock')
      
      const info = {
        sshAuthSock,
        defaultAgentPath,
        agentType: 'unknown'
      }
      
      // 识别Agent类型
      if (sshAuthSock) {
        if (sshAuthSock.includes('1password')) {
          info.agentType = '1Password SSH Agent'
        } else if (sshAuthSock.includes('tmp') || sshAuthSock.includes('launchd')) {
          info.agentType = 'System SSH Agent'
        } else {
          info.agentType = 'Custom SSH Agent'
        }
      }
      
      console.log('📋 当前SSH Agent信息:', info)
      return info
    },

    // 检查SSH Agent中的密钥
    async checkAgentKeys () {
      return new Promise((resolve) => {
        const { spawn } = require('child_process')
        
        console.log('🔑 检查 SSH Agent 中的密钥...')
        
        const sshAdd = spawn('ssh-add', ['-l'], {
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe']
        })
        
        let stdout = ''
        let stderr = ''
        
        sshAdd.stdout.on('data', (data) => {
          stdout += data.toString()
        })
        
        sshAdd.stderr.on('data', (data) => {
          stderr += data.toString()
        })
        
        sshAdd.on('close', (code) => {
          const result = {
            success: code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
            keys: []
          }
          
          if (code === 0 && stdout.trim()) {
            // 解析密钥信息
            const keyLines = stdout.trim().split('\n')
            for (const line of keyLines) {
              const parts = line.trim().split(' ')
              if (parts.length >= 3) {
                result.keys.push({
                  bits: parts[0],
                  fingerprint: parts[1],
                  comment: parts.slice(2).join(' ')
                })
              }
            }
            console.log(`✅ 找到 ${result.keys.length} 个密钥:`)
            result.keys.forEach((key, index) => {
              console.log(`  ${index + 1}. ${key.bits} bits - ${key.comment}`)
              console.log(`     指纹: ${key.fingerprint}`)
            })
          } else if (code === 1 && stderr.includes('no identities')) {
            console.warn('⚠️  SSH Agent 中没有加载任何密钥')
            result.message = 'SSH Agent 中没有加载任何密钥'
          } else {
            console.error('❌ 检查密钥失败:', stderr || stdout)
            result.message = stderr || stdout || '未知错误'
          }
          
          resolve(result)
        })
        
        sshAdd.on('error', (err) => {
          console.error('❌ 执行 ssh-add 命令失败:', err.message)
          resolve({
            success: false,
            error: err.message,
            keys: []
          })
        })
      })
    },

    // 获取SSH Agent状态用于UI显示
    getAgentStatusForUI () {
      const agentInfo = this.getCurrentAgentInfo()
      
      return {
        currentAgent: {
          path: agentInfo.sshAuthSock,
          type: agentInfo.agentType,
          status: agentInfo.sshAuthSock ? (fs.existsSync(agentInfo.sshAuthSock) ? 'connected' : 'not_found') : 'not_set'
        },
        defaultPaths: {
          onePassword: agentInfo.defaultAgentPath
        },
        recommendations: this.getRecommendations(agentInfo)
      }
    },

    // 获取配置建议
    getRecommendations (agentInfo) {
      const recommendations = []
      
      if (!agentInfo.sshAuthSock) {
        recommendations.push({
          type: 'warning',
          message: '未检测到SSH Agent，建议启用1Password SSH Agent或系统SSH Agent'
        })
      } else if (agentInfo.agentType === 'System SSH Agent') {
        // 检查1Password Agent是否可用
        if (fs.existsSync(agentInfo.defaultAgentPath)) {
          recommendations.push({
            type: 'info',
            message: '检测到1Password SSH Agent可用，可考虑切换以获得更好的安全性'
          })
        }
      }
      
      return recommendations
    },

    // 生成简化的诊断报告
    async generateDiagnosticReport () {
      const agentInfo = this.getCurrentAgentInfo()
      const agentKeys = await this.checkAgentKeys()
      
      let report = '## SSH Agent 诊断报告\\n\\n'
      
      report += `**当前Agent配置:**\\n`
      report += `- 类型: ${agentInfo.agentType}\\n`
      report += `- 路径: ${agentInfo.sshAuthSock || '未设置'}\\n`
      report += `- 默认1Password路径: ${agentInfo.defaultAgentPath}\\n\\n`
      
      // 检查Agent socket状态
      if (agentInfo.sshAuthSock) {
        try {
          if (fs.existsSync(agentInfo.sshAuthSock)) {
            const stats = fs.statSync(agentInfo.sshAuthSock)
            report += `**Agent状态:**\\n`
            report += `- Socket状态: 可访问 ✅\\n`
            report += `- 文件类型: ${stats.isSocket() ? 'Socket' : '普通文件'}\\n`
            report += `- 权限: ${stats.mode.toString(8)}\\n\\n`
          } else {
            report += `**Agent状态:**\\n`
            report += `- Socket状态: 不存在 ❌\\n\\n`
          }
        } catch (err) {
          report += `**Agent状态:**\\n`
          report += `- Socket状态: 检查失败 (${err.message})\\n\\n`
        }
      }
      
      report += `**SSH Agent 中的密钥:**\\n`
      if (agentKeys.success && agentKeys.keys.length > 0) {
        for (let i = 0; i < agentKeys.keys.length; i++) {
          const key = agentKeys.keys[i]
          report += `${i + 1}. ${key.comment}\\n`
          report += `   - 位数: ${key.bits}\\n`
          report += `   - 指纹: ${key.fingerprint}\\n\\n`
        }
      } else if (agentKeys.message) {
        report += `- ${agentKeys.message}\\n`
      } else if (agentKeys.error) {
        report += `- 错误: ${agentKeys.error}\\n`
      } else {
        report += '- 无法获取密钥信息\\n'
      }
      
      return report
    }
  },

  // SSH 配置管理
  sshConfig: {
    // 保存 SSH 配置
    save (config) {
      console.log('💾 保存SSH配置:', config)
      
      // 使用重试机制处理版本冲突
      const maxRetries = 3
      let retryCount = 0
      
      while (retryCount < maxRetries) {
        try {
          // 每次重试都获取最新的文档和数据
          const currentDoc = window.utools.db.get('ssh_configs')
          const configs = currentDoc ? currentDoc.data : []
          
          console.log(`📚 当前文档版本: ${currentDoc ? currentDoc._rev : '新文档'}`)
          console.log(`📚 当前配置数量: ${configs.length}`)
          
          const existingIndex = configs.findIndex(c => c.id === config.id)
          
          if (existingIndex >= 0) {
            console.log('📝 更新现有配置，索引:', existingIndex)
            console.log('📝 原配置:', configs[existingIndex])
            configs[existingIndex] = { ...config }
            console.log('📝 新配置:', configs[existingIndex])
          } else {
            console.log('➕ 创建新配置')
            if (!config.id) {
              config.id = Date.now().toString()
            }
            configs.push({ ...config })
          }
          
          // 准备保存的文档
          const docToSave = {
            _id: 'ssh_configs',
            data: configs
          }
          
          // 如果文档已存在，需要包含_rev版本号
          if (currentDoc && currentDoc._rev) {
            docToSave._rev = currentDoc._rev
          }
          
          console.log(`🔄 尝试保存 (第${retryCount + 1}次)...`)
          const saveResult = window.utools.db.put(docToSave)
          
          if (saveResult.error) {
            if (saveResult.name === 'conflict') {
              retryCount++
              console.warn(`⚠️ 版本冲突，准备重试 (${retryCount}/${maxRetries})...`)
              if (retryCount >= maxRetries) {
                console.error('❌ 达到最大重试次数，保存失败')
                return { success: false, error: '保存失败：版本冲突无法解决' }
              }
              continue // 重试
            } else {
              console.error('❌ 保存失败:', saveResult)
              return { success: false, error: saveResult.message || '保存失败' }
            }
          } else {
            console.log('✅ 保存成功:', saveResult)
            console.log('💾 最终配置列表:', configs)
            return config
          }
        } catch (error) {
          console.error('❌ 保存配置时发生异常:', error)
          return { success: false, error: error.message }
        }
      }
      
      return { success: false, error: '保存失败：超过最大重试次数' }
    },
    
    // 获取所有 SSH 配置
    getAll () {
      const result = window.utools.db.get('ssh_configs')
      const configs = result ? result.data : []
      console.log('📖 读取SSH配置列表:', configs.length, '个配置')
      configs.forEach((config, index) => {
        console.log(`📖 配置${index + 1}:`, {
          id: config.id,
          name: config.name,
          host: config.host,
          authType: config.authType,
          // 只显示关键字段，避免敏感信息
          hasPassword: !!config.password,
          hasPrivateKey: !!config.privateKey,
          hasAgentPath: !!config.agentPath
        })
      })
      return configs
    },

    // 根据ID获取单个配置（新增调试方法）
    getById (id) {
      const configs = this.getAll()
      const config = configs.find(c => c.id === id)
      console.log('🔍 根据ID获取配置:', id, '结果:', config)
      return config
    },

    // 验证配置完整性
    validateConfig (config) {
      const issues = []
      
      if (!config.id) issues.push('缺少配置ID')
      if (!config.name) issues.push('缺少配置名称')
      if (!config.host) issues.push('缺少主机地址')
      if (!config.username) issues.push('缺少用户名')
      if (!config.authType) issues.push('缺少认证类型')
      
      // 根据认证类型检查必要字段
      if (config.authType === 'password' && !config.password) {
        issues.push('密码认证缺少密码')
      }
      if (config.authType === 'privateKey' && !config.privateKey) {
        issues.push('私钥认证缺少私钥')
      }
      if (config.authType === 'agent') {
        // SSH Agent认证可以没有agentPath，会使用默认路径
        console.log('✅ SSH Agent认证配置，agentPath:', config.agentPath || '使用默认路径')
      }
      
      if (issues.length > 0) {
        console.warn('⚠️ 配置验证失败:', issues)
        return { valid: false, issues }
      }
      
      console.log('✅ 配置验证通过')
      return { valid: true, issues: [] }
    },

    // 调试工具：打印所有配置的详细信息
    debugAllConfigs () {
      console.log('🔧 调试：打印所有SSH配置详情')
      const configs = this.getAll()
      
      if (configs.length === 0) {
        console.log('📝 没有找到任何SSH配置')
        return
      }
      
      configs.forEach((config, index) => {
        console.log(`\n📋 配置 ${index + 1}:`)
        console.log('  ID:', config.id)
        console.log('  名称:', config.name)
        console.log('  主机:', config.host)
        console.log('  端口:', config.port)
        console.log('  用户名:', config.username)
        console.log('  认证类型:', config.authType)
        
        if (config.authType === 'password') {
          console.log('  密码:', config.password ? '已设置' : '未设置')
        } else if (config.authType === 'privateKey') {
          console.log('  私钥:', config.privateKey ? '已设置' : '未设置')
          console.log('  密码短语:', config.passphrase ? '已设置' : '未设置')
        } else if (config.authType === 'agent') {
          console.log('  Agent路径:', config.agentPath || '使用默认路径')
          console.log('  公钥:', config.publicKey || '未指定')
        }
        
        const validation = this.validateConfig(config)
        console.log('  验证状态:', validation.valid ? '✅ 通过' : '❌ 失败')
        if (!validation.valid) {
          console.log('  问题:', validation.issues)
        }
      })
    },
    
    // 删除 SSH 配置
    delete (id) {
      console.log('🗑️ 删除SSH配置:', id)
      
      try {
        // 获取最新文档
        const currentDoc = window.utools.db.get('ssh_configs')
        if (!currentDoc || !currentDoc.data) {
          console.log('📝 没有找到配置文档')
          return { success: false, error: '没有找到配置' }
        }
        
        const configs = currentDoc.data
        const originalLength = configs.length
        const filteredConfigs = configs.filter(c => c.id !== id)
        
        if (filteredConfigs.length === originalLength) {
          console.log('❌ 没有找到要删除的配置')
          return { success: false, error: '配置不存在' }
        }
        
        // 保存更新后的配置
        const saveResult = window.utools.db.put({
          _id: 'ssh_configs',
          _rev: currentDoc._rev,
          data: filteredConfigs
        })
        
        if (saveResult.error) {
          console.error('❌ 删除失败:', saveResult)
          return { success: false, error: saveResult.message }
        }
        
        console.log('✅ 删除成功')
        return { success: true }
      } catch (error) {
        console.error('❌ 删除配置时发生异常:', error)
        return { success: false, error: error.message }
      }
    },
    
    // 测试 SSH 连接
    async test (config) {
      return new Promise((resolve) => {
        console.log('Testing SSH connection:', { host: config.host, port: config.port, username: config.username, authType: config.authType })
        
        const conn = new Client()
        let resolved = false
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            console.log('SSH test timeout')
            conn.end()
            resolve({ success: false, error: '连接超时（10秒）' })
          }
        }, 10000)
        
        conn.on('ready', () => {
          if (!resolved) {
            resolved = true
            console.log('SSH test successful')
            clearTimeout(timeout)
            conn.end()
            resolve({ success: true, message: '连接测试成功' })
          }
        })
        
        conn.on('error', (err) => {
          if (!resolved) {
            resolved = true
            console.error('SSH test error:', err)
            
            // 详细的错误诊断
            console.error('🚨 SSH 连接错误详情:')
            console.error('  - 错误类型:', err.constructor.name)
            console.error('  - 错误消息:', err.message)
            console.error('  - 错误代码:', err.code)
            console.error('  - 错误级别:', err.level)
            console.error('  - 完整错误对象:', JSON.stringify(err, null, 2))
            
            // 针对SSH Agent特定的错误诊断
            if (config.authType === 'agent' || config.useSSHAgent) {
              console.error('🔍 SSH Agent 错误分析:')
              
              // 检查常见的SSH Agent问题
              if (err.message && err.message.includes('All configured authentication methods failed')) {
                console.error('  - 可能原因: SSH Agent 中没有有效的密钥')
                console.error('  - 建议检查: ssh-add -l 命令查看已加载的密钥')
              }
              
              if (err.message && err.message.includes('connect ENOENT')) {
                console.error('  - 可能原因: SSH Agent socket 文件不存在或无法访问')
                console.error('  - 建议检查: SSH_AUTH_SOCK 环境变量是否正确')
              }
              
              if (err.message && err.message.includes('connect EACCES')) {
                console.error('  - 可能原因: 没有权限访问 SSH Agent socket')
                console.error('  - 建议检查: socket 文件的权限设置')
              }
            }
            
            clearTimeout(timeout)
            resolve({ 
              success: false, 
              error: err.message || err.toString(),
              errorDetails: {
                type: err.constructor.name,
                code: err.code,
                level: err.level,
                authType: config.authType
              }
            })
          }
        })
        
        conn.on('close', () => {
          if (!resolved) {
            resolved = true
            console.log('SSH test connection closed')
            clearTimeout(timeout)
            resolve({ success: false, error: '连接被关闭' })
          }
        })
        
        try {
          const connectConfig = {
            host: config.host,
            port: config.port || 22,
            username: config.username,
            readyTimeout: 8000
          }
          
          if (config.authType === 'password') {
            connectConfig.password = config.password
          } else if (config.authType === 'privateKey') {
            connectConfig.privateKey = config.privateKey
            if (config.passphrase) {
              connectConfig.passphrase = config.passphrase
            }
          } else if (config.authType === 'agent' || config.useSSHAgent) {
            // SSH Agent 配置诊断
            const pluginSshAuthSock = process.env.SSH_AUTH_SOCK
            const customAgentPath = config.agentPath
            const defaultAgentPath = path.join(os.homedir(), 'Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock')
            
            // 简化SSH Agent诊断
            console.log('🔍 SSH Agent 连接诊断:')
            
            // 选择Agent路径 - 优先使用用户配置
            let agentPath
            let agentSource
            
            if (customAgentPath) {
              // 处理 ~ 路径
              agentPath = customAgentPath.startsWith('~') 
                ? path.join(os.homedir(), customAgentPath.slice(1))
                : customAgentPath
              agentSource = '自定义配置'
            } else if (pluginSshAuthSock) {
              agentPath = pluginSshAuthSock
              agentSource = '环境变量 SSH_AUTH_SOCK'
            } else {
              agentPath = defaultAgentPath
              agentSource = '默认1Password路径'
            }
            
            console.log(`  - 使用Agent: ${agentPath} (${agentSource})`)
            
            // 检查 agent socket 是否存在
            try {
              if (fs.existsSync(agentPath)) {
                const stats = fs.statSync(agentPath)
                console.log('  - Agent socket 状态: 存在 ✅')
                console.log('  - Socket 文件信息:', {
                  isSocket: stats.isSocket(),
                  mode: stats.mode.toString(8),
                  size: stats.size,
                  mtime: stats.mtime
                })
              } else {
                console.warn('  - Agent socket 状态: 不存在 ❌')
              }
            } catch (err) {
              console.error('  - Agent socket 检查失败:', err.message)
            }
            
            // 异步检查SSH Agent中的密钥（不阻塞连接）
            window.services.sshAgent.checkAgentKeys().then(agentKeys => {
              if (agentKeys.success && agentKeys.keys.length > 0) {
                console.log(`  - SSH Agent 中有 ${agentKeys.keys.length} 个密钥可用 ✅`)
              } else if (agentKeys.message) {
                console.warn(`  - SSH Agent 密钥状态: ${agentKeys.message} ⚠️`)
              }
            }).catch(err => {
              console.warn('  - 无法检查SSH Agent密钥:', err.message)
            })
            
            connectConfig.agent = agentPath
            
            // 如果提供了公钥，可以用于SSH Agent的密钥选择
            if (config.publicKey) {
              console.log('  - 使用指定公钥进行 Agent 认证')
              connectConfig.publicKey = config.publicKey
            } else {
              console.log('  - 使用 Agent 中所有可用密钥进行认证')
            }
          }
          
          console.log('Connecting with config:', { ...connectConfig, password: connectConfig.password ? '[HIDDEN]' : undefined, agent: connectConfig.agent ? '[AGENT_PATH]' : undefined })
          conn.connect(connectConfig)
        } catch (err) {
          if (!resolved) {
            resolved = true
            console.error('SSH test connect error:', err)
            clearTimeout(timeout)
            resolve({ success: false, error: err.message || err.toString() })
          }
        }
      })
    }
  },

  // SSH 命令管理
  sshCommand: {
    // 保存命令配置
    save (command) {
      const commands = this.getAll()
      const existingIndex = commands.findIndex(c => c.id === command.id)
      
      if (existingIndex >= 0) {
        commands[existingIndex] = command
      } else {
        command.id = Date.now().toString()
        commands.push(command)
      }
      
      window.utools.db.put({
        _id: 'ssh_commands',
        data: commands
      })
      return command
    },
    
    // 获取所有命令配置
    getAll () {
      const result = window.utools.db.get('ssh_commands')
      return result ? result.data : []
    },
    
    // 删除命令配置
    delete (id) {
      const commands = this.getAll()
      const filteredCommands = commands.filter(c => c.id !== id)
      window.utools.db.put({
        _id: 'ssh_commands',
        data: filteredCommands
      })
      return true
    }
  },

  // SSH 连接和执行
  ssh: {
    // 创建 SSH 连接
    async connect (config) {
      return new Promise((resolve) => {
        const conn = new Client()
        const connectionId = `ssh_${Date.now()}`
        
        conn.on('ready', () => {
          sshConnections.set(connectionId, conn)
          resolve({ success: true, connectionId, message: 'Connected successfully' })
        })
        
        conn.on('error', (err) => {
          console.error('SSH connection error:', err)
          
          // 详细的错误诊断
          console.error('🚨 SSH 正式连接错误详情:')
          console.error('  - 错误类型:', err.constructor.name)
          console.error('  - 错误消息:', err.message)
          console.error('  - 错误代码:', err.code)
          console.error('  - 错误级别:', err.level)
          
          // 针对SSH Agent特定的错误诊断
          if (config.authType === 'agent' || config.useSSHAgent) {
            console.error('🔍 SSH Agent 连接错误分析:')
            
            // 检查常见的SSH Agent问题
            if (err.message && err.message.includes('All configured authentication methods failed')) {
              console.error('  - 可能原因: SSH Agent 中没有有效的密钥')
              console.error('  - 建议: 使用 ssh-add -l 命令检查已加载的密钥')
            }
            
            if (err.message && err.message.includes('connect ENOENT')) {
              console.error('  - 可能原因: SSH Agent socket 文件不存在或无法访问')
              console.error('  - 建议: 检查 SSH_AUTH_SOCK 环境变量')
            }
          }
          
          resolve({ 
            success: false, 
            error: err.message,
            errorDetails: {
              type: err.constructor.name,
              code: err.code,
              level: err.level,
              authType: config.authType
            }
          })
        })
        
        conn.on('end', () => {
          sshConnections.delete(connectionId)
        })
        
        try {
          const connectConfig = {
            host: config.host,
            port: config.port || 22,
            username: config.username
          }
          
          if (config.authType === 'password') {
            connectConfig.password = config.password
          } else if (config.authType === 'privateKey') {
            connectConfig.privateKey = config.privateKey
            if (config.passphrase) {
              connectConfig.passphrase = config.passphrase
            }
          } else if (config.authType === 'agent' || config.useSSHAgent) {
            // SSH Agent 配置诊断
            const pluginSshAuthSock = process.env.SSH_AUTH_SOCK
            const customAgentPath = config.agentPath
            const defaultAgentPath = path.join(os.homedir(), 'Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock')
            
            // 简化SSH Agent诊断
            console.log('🔍 SSH Agent 正式连接:')
            
            // 选择Agent路径 - 优先使用用户配置
            let agentPath
            let agentSource
            
            if (customAgentPath) {
              // 处理 ~ 路径
              agentPath = customAgentPath.startsWith('~') 
                ? path.join(os.homedir(), customAgentPath.slice(1))
                : customAgentPath
              agentSource = '自定义配置'
            } else if (pluginSshAuthSock) {
              agentPath = pluginSshAuthSock
              agentSource = '环境变量 SSH_AUTH_SOCK'
            } else {
              agentPath = defaultAgentPath
              agentSource = '默认1Password路径'
            }
            
            console.log(`  - 使用Agent: ${agentPath} (${agentSource})`)
            
            // 检查 agent socket 是否存在
            try {
              if (fs.existsSync(agentPath)) {
                const stats = fs.statSync(agentPath)
                console.log('  - Agent socket 状态: 存在 ✅')
                console.log('  - Socket 文件信息:', {
                  isSocket: stats.isSocket(),
                  mode: stats.mode.toString(8),
                  size: stats.size,
                  mtime: stats.mtime
                })
              } else {
                console.warn('  - Agent socket 状态: 不存在 ❌')
              }
            } catch (err) {
              console.error('  - Agent socket 检查失败:', err.message)
            }
            
            connectConfig.agent = agentPath
            
            // 如果提供了公钥，可以用于SSH Agent的密钥选择
            if (config.publicKey) {
              console.log('  - 使用指定公钥进行 Agent 认证')
              connectConfig.publicKey = config.publicKey
            } else {
              console.log('  - 使用 Agent 中所有可用密钥进行认证')
            }
          }
          
          console.log('正式连接配置:', { ...connectConfig, password: connectConfig.password ? '[HIDDEN]' : undefined, agent: connectConfig.agent ? '[AGENT_PATH]' : undefined })
          conn.connect(connectConfig)
        } catch (err) {
          resolve({ success: false, error: err.message })
        }
      })
    },
    
    // 执行命令
    async execute (connectionId, command) {
      return new Promise((resolve) => {
        const conn = sshConnections.get(connectionId)
        if (!conn) {
          resolve({ success: false, error: 'Connection not found' })
          return
        }
        
        conn.exec(command, (err, stream) => {
          if (err) {
            resolve({ success: false, error: err.message })
            return
          }
          
          let stdout = ''
          let stderr = ''
          
          stream.on('close', (code, signal) => {
            resolve({
              success: true,
              stdout,
              stderr,
              exitCode: code,
              signal
            })
          })
          
          stream.on('data', (data) => {
            stdout += data.toString()
          })
          
          stream.stderr.on('data', (data) => {
            stderr += data.toString()
          })
        })
      })
    },
    
    // 断开连接
    disconnect (connectionId) {
      const conn = sshConnections.get(connectionId)
      if (conn) {
        conn.end()
        sshConnections.delete(connectionId)
        return { success: true, message: 'Disconnected successfully' }
      }
      return { success: false, error: 'Connection not found' }
    },
    
    // 获取所有活动连接
    getActiveConnections () {
      return Array.from(sshConnections.keys())
    }
  }
}

console.log('✅ services.js 加载完成，可用方法：')
console.log('  - sshAgent:', Object.keys(window.services.sshAgent))
console.log('  - sshConfig:', Object.keys(window.services.sshConfig))
console.log('  - sshCommand:', Object.keys(window.services.sshCommand))
console.log('  - ssh:', Object.keys(window.services.ssh))
console.log('\n🔧 调试命令：')
console.log('  - window.services.sshConfig.debugAllConfigs() // 查看所有配置详情')
console.log('  - window.services.sshAgent.getCurrentAgentInfo() // 查看SSH Agent信息')
console.log('  - window.services.sshAgent.getAgentStatusForUI() // 查看UI状态信息')
