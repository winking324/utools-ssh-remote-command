import { useState, useEffect, useRef } from 'react'
import './index.css'

export default function SSHMain() {
  const [configs, setConfigs] = useState([])
  const [commands, setCommands] = useState([])
  const [selectedConfig, setSelectedConfig] = useState(null)
  const [currentConnection, setCurrentConnection] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [commandHistory, setCommandHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [output, setOutput] = useState([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [showConfigs, setShowConfigs] = useState(true)
  const [activeTab, setActiveTab] = useState('terminal')
  
  const outputRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    loadConfigs()
    loadCommands()
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const loadConfigs = () => {
    try {
      const savedConfigs = window.services?.sshConfig?.getAll?.() || []
      setConfigs(savedConfigs)
    } catch (error) {
      console.error('Failed to load SSH configs:', error)
    }
  }

  const loadCommands = () => {
    try {
      const savedCommands = window.services?.sshCommand?.getAll?.() || []
      setCommands(savedCommands)
    } catch (error) {
      console.error('Failed to load SSH commands:', error)
    }
  }

  const handleConnect = async (config) => {
    if (currentConnection) {
      await handleDisconnect()
    }

    setIsConnecting(true)
    setSelectedConfig(config)
    
    try {
      if (window.services?.ssh?.connect) {
        const result = await window.services.ssh.connect(config)
        if (result.success) {
          setCurrentConnection(result.connectionId)
          setShowConfigs(false)
          addOutput(`✓ 已连接到 ${config.name} (${config.host}:${config.port})`, 'success')
          window.utools?.showNotification?.('SSH连接成功')
        } else {
          addOutput(`✗ 连接失败: ${result.error}`, 'error')
          window.utools?.showNotification?.(`连接失败: ${result.error}`)
        }
      } else {
        addOutput(`请在uTools中使用此插件进行SSH连接`, 'error')
      }
    } catch (error) {
      console.error('Connection failed:', error)
      addOutput(`✗ 连接失败: ${error.message}`, 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (currentConnection) {
      try {
        if (window.services?.ssh?.disconnect) {
          const result = window.services.ssh.disconnect(currentConnection)
          if (result.success) {
            addOutput(`✓ 已断开连接`, 'success')
            window.utools?.showNotification?.('已断开SSH连接')
          }
        }
      } catch (error) {
        console.error('Disconnect failed:', error)
      } finally {
        setCurrentConnection(null)
        setSelectedConfig(null)
        setOutput([])
        setShowConfigs(true)
      }
    }
  }

  const addOutput = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setOutput(prev => [...prev, { text, type, timestamp }])
  }

  const executeCommand = async (command) => {
    if (!currentConnection || !command.trim()) return

    setIsExecuting(true)
    const cmd = command.trim()
    
    // 添加命令到历史记录
    if (!commandHistory.includes(cmd)) {
      setCommandHistory(prev => [cmd, ...prev.slice(0, 49)]) // 保持最多50条历史
    }
    setHistoryIndex(-1)

    addOutput(`$ ${cmd}`, 'command')

    try {
      if (window.services?.ssh?.execute) {
        const result = await window.services.ssh.execute(currentConnection, cmd)
        if (result.success) {
          if (result.stdout) {
            addOutput(result.stdout, 'stdout')
          }
          if (result.stderr) {
            addOutput(result.stderr, 'stderr')
          }
          if (result.exitCode !== 0) {
            addOutput(`Exit code: ${result.exitCode}`, 'error')
          }
        } else {
          addOutput(`执行失败: ${result.error}`, 'error')
        }
      } else {
        addOutput(`请在uTools中使用此插件执行SSH命令`, 'error')
      }
    } catch (error) {
      console.error('Command execution failed:', error)
      addOutput(`执行失败: ${error.message}`, 'error')
    } finally {
      setIsExecuting(false)
      setCommandInput('')
    }
  }

  const handleCommandSubmit = (e) => {
    e.preventDefault()
    executeCommand(commandInput)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommandInput(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > -1) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommandInput(newIndex === -1 ? '' : commandHistory[newIndex])
      }
    }
  }

  const handleQuickCommand = (command) => {
    setCommandInput(command.command)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  const clearOutput = () => {
    setOutput([])
  }

  const openConfigManagement = () => {
    window.utools?.redirect?.('SSH Remote 配置', null)
  }

  const openCommandManagement = () => {
    window.utools?.redirect?.('SSH Remote Command 配置', null)
  }

  const groupedCommands = commands.reduce((acc, cmd) => {
    const category = cmd.category || 'custom'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(cmd)
    return acc
  }, {})

  const categories = [
    { value: 'system', label: '系统管理' },
    { value: 'docker', label: 'Docker' },
    { value: 'git', label: 'Git' },
    { value: 'nginx', label: 'Nginx' },
    { value: 'database', label: '数据库' },
    { value: 'monitoring', label: '监控' },
    { value: 'custom', label: '自定义' }
  ]

  if (showConfigs || !currentConnection) {
    return (
      <div className="ssh-main">
        <div className="ssh-header">
          <h2>SSH 远程连接</h2>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={openConfigManagement}>
              管理配置
            </button>
            <button className="btn btn-secondary" onClick={openCommandManagement}>
              管理命令
            </button>
          </div>
        </div>

        {configs.length === 0 ? (
          <div className="empty-state">
            <h3>暂无SSH配置</h3>
            <p>请先添加SSH服务器配置</p>
            <button className="btn btn-primary" onClick={openConfigManagement}>
              添加SSH配置
            </button>
          </div>
        ) : (
          <div className="config-selection">
            <h3>选择SSH服务器</h3>
            <div className="config-grid">
              {configs.map(config => (
                <div 
                  key={config.id} 
                  className="config-item"
                  onClick={() => handleConnect(config)}
                >
                  <div className="config-info">
                    <h4>{config.name}</h4>
                    <p>{config.username}@{config.host}:{config.port}</p>
                    <span className="auth-type">
                      {config.authType === 'password' ? '🔐 密码' : 
                       config.authType === 'privateKey' ? '🔑 私钥' : 
                       '🤖 SSH Agent'}
                    </span>
                    {config.authType === 'agent' && config.publicKey && (
                      <small className="public-key-hint">
                        公钥: {config.publicKey.substring(0, 30)}...
                      </small>
                    )}
                  </div>
                  {isConnecting && selectedConfig?.id === config.id ? (
                    <div className="connecting">连接中...</div>
                  ) : (
                    <div className="connect-btn">连接</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ssh-main connected">
      <div className="ssh-header">
        <div className="connection-info">
          <h2>{selectedConfig.name}</h2>
          <span className="connection-details">
            {selectedConfig.username}@{selectedConfig.host}:{selectedConfig.port}
          </span>
        </div>
        <div className="header-actions">
          <button className="btn btn-danger" onClick={handleDisconnect}>
            断开连接
          </button>
        </div>
      </div>

      <div className="ssh-workspace">
        <div className="main-content">
          <div className="tab-nav">
            <button 
              className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              终端
            </button>
            <button 
              className={`tab-btn ${activeTab === 'commands' ? 'active' : ''}`}
              onClick={() => setActiveTab('commands')}
            >
              快捷命令
            </button>
          </div>

          {activeTab === 'terminal' && (
            <div className="terminal-section">
              <div className="terminal-header">
                <span>终端输出</span>
                <button className="btn btn-sm" onClick={clearOutput}>
                  清空
                </button>
              </div>
              <div className="terminal-output" ref={outputRef}>
                {output.map((item, index) => (
                  <div key={index} className={`output-line ${item.type}`}>
                    <span className="timestamp">{item.timestamp}</span>
                    <pre>{item.text}</pre>
                  </div>
                ))}
                {isExecuting && (
                  <div className="output-line executing">
                    <span className="loading">执行中...</span>
                  </div>
                )}
              </div>
              <form className="command-input-form" onSubmit={handleCommandSubmit}>
                <div className="input-group">
                  <span className="prompt">$</span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入命令... (↑↓ 浏览历史)"
                    disabled={isExecuting}
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isExecuting || !commandInput.trim()}
                  >
                    执行
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'commands' && (
            <div className="commands-section">
              <div className="commands-header">
                <h3>快捷命令</h3>
                <button className="btn btn-secondary" onClick={openCommandManagement}>
                  管理命令
                </button>
              </div>
              
              {commands.length === 0 ? (
                <div className="empty-commands">
                  <p>暂无保存的命令</p>
                  <button className="btn btn-primary" onClick={openCommandManagement}>
                    添加命令
                  </button>
                </div>
              ) : (
                <div className="command-categories">
                  {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                    <div key={category} className="command-category">
                      <h4>
                        {categories.find(c => c.value === category)?.label || '自定义'}
                      </h4>
                      <div className="command-list">
                        {categoryCommands.map(command => (
                          <div 
                            key={command.id} 
                            className="quick-command"
                            onClick={() => handleQuickCommand(command)}
                          >
                            <div className="command-name">{command.name}</div>
                            <code className="command-text">{command.command}</code>
                            {command.description && (
                              <div className="command-desc">{command.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}