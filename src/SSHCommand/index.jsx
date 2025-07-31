import { useState, useEffect } from 'react'
import './index.css'

export default function SSHCommand() {
  const [commands, setCommands] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingCommand, setEditingCommand] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    description: '',
    category: 'system'
  })

  useEffect(() => {
    loadCommands()
  }, [])

  const loadCommands = () => {
    try {
      const savedCommands = window.services?.sshCommand?.getAll?.() || []
      setCommands(savedCommands)
    } catch (error) {
      console.error('Failed to load SSH commands:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const command = {
        ...formData,
        id: editingCommand?.id || Date.now().toString(),
        createdAt: editingCommand?.createdAt || new Date().toISOString()
      }
      
      // 检查是否在uTools环境中
      if (!window.utools) {
        console.log('请在uTools中使用此功能')
        resetForm()
        return
      }

      // 等待services加载完成
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries && !window.services?.sshCommand?.save) {
        await new Promise(resolve => setTimeout(resolve, 500))
        retryCount++
      }

      if (!window.services?.sshCommand?.save) {
        console.log('插件服务未就绪，请稍后重试')
        resetForm()
        return
      }

      const savedCommand = window.services.sshCommand.save(command)
      loadCommands()
      resetForm()
      window.utools?.showNotification?.(`命令 "${savedCommand.name}" 已保存`)
    } catch (error) {
      console.error('Failed to save SSH command:', error)
      window.utools?.showNotification?.('保存命令失败')
    }
  }

  const handleEdit = (command) => {
    setEditingCommand(command)
    setFormData({
      name: command.name,
      command: command.command,
      description: command.description || '',
      category: command.category || 'system'
    })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    try {
      // 检查是否在uTools环境中
      if (!window.utools) {
        console.log('请在uTools中使用此功能')
        return
      }

      // 等待services加载完成
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries && !window.services?.sshCommand?.delete) {
        await new Promise(resolve => setTimeout(resolve, 500))
        retryCount++
      }

      if (!window.services?.sshCommand?.delete) {
        console.log('插件服务未就绪，请稍后重试')
        return
      }

      window.services.sshCommand.delete(id)
      loadCommands()
      window.utools?.showNotification?.('命令已删除')
    } catch (error) {
      console.error('Failed to delete SSH command:', error)
      window.utools?.showNotification?.('删除命令失败')
    }
  }

  const handleCopyCommand = (command) => {
    if (window.utools?.copyText) {
      window.utools.copyText(command.command)
      window.utools?.showNotification?.('命令已复制到剪贴板')
    } else {
      // 开发环境使用浏览器clipboard API
      navigator.clipboard?.writeText(command.command).then(() => {
        console.log('命令已复制到剪贴板')
      }).catch(() => {
        console.log('复制失败，命令内容：', command.command)
      })
    }
  }

  const resetForm = () => {
    setEditingCommand(null)
    setFormData({
      name: '',
      command: '',
      description: '',
      category: 'system'
    })
    setShowForm(false)
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const categories = [
    { value: 'system', label: '系统管理' },
    { value: 'docker', label: 'Docker' },
    { value: 'git', label: 'Git' },
    { value: 'nginx', label: 'Nginx' },
    { value: 'database', label: '数据库' },
    { value: 'monitoring', label: '监控' },
    { value: 'custom', label: '自定义' }
  ]

  const commonCommands = [
    { name: '查看系统信息', command: 'uname -a', category: 'system' },
    { name: '查看磁盘使用', command: 'df -h', category: 'system' },
    { name: '查看内存使用', command: 'free -h', category: 'system' },
    { name: '查看进程', command: 'ps aux', category: 'system' },
    { name: '查看网络连接', command: 'netstat -tulpn', category: 'system' },
    { name: '查看Docker容器', command: 'docker ps -a', category: 'docker' },
    { name: '查看Docker镜像', command: 'docker images', category: 'docker' },
    { name: 'Git状态', command: 'git status', category: 'git' },
    { name: 'Git日志', command: 'git log --oneline -10', category: 'git' },
    { name: 'Nginx状态', command: 'systemctl status nginx', category: 'nginx' },
    { name: '测试Nginx配置', command: 'nginx -t', category: 'nginx' }
  ]

  const handleAddCommonCommand = (commonCmd) => {
    setFormData({
      name: commonCmd.name,
      command: commonCmd.command,
      description: `常用${categories.find(c => c.value === commonCmd.category)?.label}命令`,
      category: commonCmd.category
    })
    setShowForm(true)
  }

  const groupedCommands = commands.reduce((acc, cmd) => {
    const category = cmd.category || 'custom'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(cmd)
    return acc
  }, {})

  return (
    <div className="ssh-command">
      <div className="ssh-command-header">
        <h2>SSH 命令配置管理</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          添加命令
        </button>
      </div>

      {showForm && (
        <div className="ssh-command-form">
          <div className="form-header">
            <h3>{editingCommand ? '编辑命令' : '添加命令'}</h3>
            <button className="btn-close" onClick={resetForm}>×</button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>命令名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="如：查看系统状态"
                  required
                />
              </div>
              <div className="form-group">
                <label>分类</label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>命令内容</label>
              <input
                type="text"
                value={formData.command}
                onChange={(e) => handleInputChange('command', e.target.value)}
                placeholder="如：ps aux | grep nginx"
                required
              />
            </div>

            <div className="form-group">
              <label>描述 (可选)</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="命令的作用和注意事项"
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                {editingCommand ? '更新命令' : '保存命令'}
              </button>
            </div>
          </form>

          {!editingCommand && (
            <div className="common-commands">
              <h4>常用命令模板</h4>
              <div className="common-command-grid">
                {commonCommands.map((cmd, index) => (
                  <div 
                    key={index} 
                    className="common-command-item"
                    onClick={() => handleAddCommonCommand(cmd)}
                  >
                    <span className="command-name">{cmd.name}</span>
                    <code className="command-text">{cmd.command}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ssh-command-list">
        <h3>已保存的命令</h3>
        {commands.length === 0 ? (
          <div className="empty-state">
            <p>暂无保存的命令，点击"添加命令"或选择常用命令模板开始创建</p>
          </div>
        ) : (
          <div className="command-categories">
            {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
              <div key={category} className="category-section">
                <h4 className="category-title">
                  {categories.find(c => c.value === category)?.label || '自定义'}
                  <span className="command-count">({categoryCommands.length})</span>
                </h4>
                <div className="command-cards">
                  {categoryCommands.map(command => (
                    <div key={command.id} className="command-card">
                      <div className="command-header">
                        <h5>{command.name}</h5>
                        <div className="command-actions">
                          <button 
                            className="btn-icon" 
                            onClick={() => handleCopyCommand(command)}
                            title="复制命令"
                          >
                            📋
                          </button>
                          <button 
                            className="btn-icon" 
                            onClick={() => handleEdit(command)}
                            title="编辑命令"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-icon" 
                            onClick={() => handleDelete(command.id)}
                            title="删除命令"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div className="command-content">
                        <code>{command.command}</code>
                      </div>
                      {command.description && (
                        <div className="command-description">
                          <p>{command.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}