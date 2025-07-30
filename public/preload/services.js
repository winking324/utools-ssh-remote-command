const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { Client } = require('ssh2')
const { spawn } = require('node-pty')

// SSH 连接管理
const sshConnections = new Map()

// 通过 window 对象向渲染进程注入 nodejs 能力
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

  // SSH 配置管理
  sshConfig: {
    // 保存 SSH 配置
    save (config) {
      const configs = this.getAll()
      const existingIndex = configs.findIndex(c => c.id === config.id)
      
      if (existingIndex >= 0) {
        configs[existingIndex] = config
      } else {
        config.id = Date.now().toString()
        configs.push(config)
      }
      
      window.utools.db.put({
        _id: 'ssh_configs',
        data: configs
      })
      return config
    },
    
    // 获取所有 SSH 配置
    getAll () {
      const result = window.utools.db.get('ssh_configs')
      return result ? result.data : []
    },
    
    // 删除 SSH 配置
    delete (id) {
      const configs = this.getAll()
      const filteredConfigs = configs.filter(c => c.id !== id)
      window.utools.db.put({
        _id: 'ssh_configs',
        data: filteredConfigs
      })
      return true
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
            clearTimeout(timeout)
            resolve({ success: false, error: err.message || err.toString() })
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
            connectConfig.agent = process.env.SSH_AUTH_SOCK || 
                                   config.agentPath ||
                                   path.join(os.homedir(), 'Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock')
            // 如果提供了公钥，可以用于SSH Agent的密钥选择
            if (config.publicKey) {
              connectConfig.publicKey = config.publicKey
            }
          }
          
          console.log('Connecting with config:', { ...connectConfig, password: connectConfig.password ? '[HIDDEN]' : undefined })
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
          resolve({ success: false, error: err.message })
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
            connectConfig.agent = process.env.SSH_AUTH_SOCK || 
                                   config.agentPath ||
                                   path.join(os.homedir(), 'Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock')
            // 如果提供了公钥，可以用于SSH Agent的密钥选择
            if (config.publicKey) {
              connectConfig.publicKey = config.publicKey
            }
          }
          
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
