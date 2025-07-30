import { useState, useEffect } from 'react'
import './index.css'

export default function SSHConfig() {
  const [configs, setConfigs] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [testing, setTesting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    useSSHAgent: false,
    agentPath: '',
    publicKey: ''
  })
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    try {
      const savedConfigs = window.services?.sshConfig?.getAll?.() || []
      setConfigs(savedConfigs)
    } catch (error) {
      console.error('Failed to load SSH configs:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const config = {
        ...formData,
        id: editingConfig?.id || Date.now().toString()
      }
      
      if (window.services?.sshConfig?.save) {
        const savedConfig = window.services.sshConfig.save(config)
        loadConfigs()
        resetForm()
        window.utools?.showNotification?.(`SSH配置 "${savedConfig.name}" 已保存`)
      } else {
        console.log('请在uTools中使用此功能')
        resetForm()
      }
    } catch (error) {
      console.error('Failed to save SSH config:', error)
      window.utools?.showNotification?.('保存SSH配置失败')
    }
  }

  const handleEdit = (config) => {
    setEditingConfig(config)
    setFormData({
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      password: config.password || '',
      privateKey: config.privateKey || '',
      passphrase: config.passphrase || '',
      useSSHAgent: config.useSSHAgent || false,
      agentPath: config.agentPath || '',
      publicKey: config.publicKey || ''
    })
    setShowForm(true)
  }

  const handleDelete = (id) => {
    try {
      if (window.services?.sshConfig?.delete) {
        window.services.sshConfig.delete(id)
        loadConfigs()
        window.utools?.showNotification?.('SSH配置已删除')
      } else {
        console.log('请在uTools中使用此功能')
      }
    } catch (error) {
      console.error('Failed to delete SSH config:', error)
      window.utools?.showNotification?.('删除SSH配置失败')
    }
  }

  const handleTest = async () => {
    setTestMessage('') // 清除之前的消息
    
    if (!formData.host || !formData.username) {
      const message = '请填写主机地址和用户名'
      setTestMessage(`❌ ${message}`)
      window.utools?.showNotification?.(message)
      return
    }

    // 检查是否在uTools环境中
    if (!window.services?.sshConfig?.test) {
      const message = '请在uTools中使用此插件进行SSH连接测试'
      setTestMessage(`⚠️ ${message}`)
      return
    }

    setTesting(true)
    setTestMessage('🔄 正在测试连接...')
    
    try {
      const result = await window.services.sshConfig.test(formData)
      if (result.success) {
        const message = '连接测试成功 ✓'
        setTestMessage(`✅ ${message}`)
        window.utools?.showNotification?.(message)
      } else {
        const message = `连接测试失败: ${result.error}`
        setTestMessage(`❌ ${message}`)
        window.utools?.showNotification?.(message)
      }
    } catch (error) {
      console.error('Test connection failed:', error)
      const message = `连接测试失败: ${error.message}`
      setTestMessage(`❌ ${message}`)
      window.utools?.showNotification?.('连接测试失败')
    } finally {
      setTesting(false)
    }
  }

  const resetForm = () => {
    setEditingConfig(null)
    setFormData({
      name: '',
      host: '',
      port: 22,
      username: '',
      authType: 'password',
      password: '',
      privateKey: '',
      passphrase: '',
      useSSHAgent: false,
      agentPath: '',
      publicKey: ''
    })
    setShowForm(false)
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // 清除测试消息当用户修改配置时
    if (testMessage) {
      setTestMessage('')
    }
  }

  return (
    <div className="ssh-config">
      <div className="ssh-config-header">
        <h2>SSH 服务器配置管理</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          添加配置
        </button>
      </div>

      {showForm && (
        <div className="ssh-config-form">
          <div className="form-header">
            <h3>{editingConfig ? '编辑 SSH 配置' : '添加 SSH 配置'}</h3>
            <button className="btn-close" onClick={resetForm}>×</button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>配置名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="如：生产服务器"
                  required
                />
              </div>
              <div className="form-group">
                <label>主机地址</label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => handleInputChange('host', e.target.value)}
                  placeholder="192.168.1.100 或 example.com"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>端口</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                  min="1"
                  max="65535"
                  required
                />
              </div>
              <div className="form-group">
                <label>用户名</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="root, ubuntu, etc."
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>认证方式</label>
              <select
                value={formData.authType}
                onChange={(e) => handleInputChange('authType', e.target.value)}
              >
                <option value="password">密码认证</option>
                <option value="privateKey">私钥认证</option>
                <option value="agent">SSH Agent</option>
              </select>
            </div>

            {formData.authType === 'password' && (
              <div className="form-group">
                <label>密码</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="SSH密码"
                  required
                />
              </div>
            )}

            {formData.authType === 'privateKey' && (
              <>
                <div className="form-group">
                  <label>私钥内容</label>
                  <textarea
                    value={formData.privateKey}
                    onChange={(e) => handleInputChange('privateKey', e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    rows="6"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>私钥密码 (可选)</label>
                  <input
                    type="password"
                    value={formData.passphrase}
                    onChange={(e) => handleInputChange('passphrase', e.target.value)}
                    placeholder="私钥加密密码"
                  />
                </div>
              </>
            )}

            {formData.authType === 'agent' && (
              <>
                <div className="form-group">
                  <label>SSH Agent 路径 (可选)</label>
                  <input
                    type="text"
                    value={formData.agentPath}
                    onChange={(e) => handleInputChange('agentPath', e.target.value)}
                    placeholder="如：~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
                  />
                  <small className="form-help">
                    留空将自动使用环境变量 SSH_AUTH_SOCK 或 1Password SSH Agent 路径
                  </small>
                </div>
                <div className="form-group">
                  <label>公钥内容 (可选，用于1Password密钥识别)</label>
                  <textarea
                    value={formData.publicKey}
                    onChange={(e) => handleInputChange('publicKey', e.target.value)}
                    placeholder="ssh-rsa AAAAB3NzaC1yc2E... 或 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5..."
                    rows="3"
                  />
                  <small className="form-help">
                    提供公钥可以帮助1Password SSH Agent更快地找到对应的私钥，特别是当Agent中有多个密钥时
                  </small>
                </div>
              </>
            )}

            {testMessage && (
              <div className={`test-message ${testMessage.includes('✅') ? 'success' : testMessage.includes('❌') ? 'error' : 'info'}`}>
                {testMessage}
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                取消
              </button>
              <button 
                type="button" 
                className="btn btn-test" 
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button type="submit" className="btn btn-primary">
                {editingConfig ? '更新配置' : '保存配置'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="ssh-config-list">
        <h3>已保存的配置</h3>
        {configs.length === 0 ? (
          <div className="empty-state">
            <p>暂无SSH配置，点击"添加配置"开始创建</p>
          </div>
        ) : (
          <div className="config-cards">
            {configs.map(config => (
              <div key={config.id} className="config-card">
                <div className="config-header">
                  <h4>{config.name}</h4>
                  <div className="config-actions">
                    <button className="btn-icon" onClick={() => handleEdit(config)}>
                      ✏️
                    </button>
                    <button className="btn-icon" onClick={() => handleDelete(config.id)}>
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="config-details">
                  <p><strong>主机:</strong> {config.host}:{config.port}</p>
                  <p><strong>用户:</strong> {config.username}</p>
                  <p><strong>认证:</strong> {
                    config.authType === 'password' ? '密码' : 
                    config.authType === 'privateKey' ? '私钥' : 
                    'SSH Agent'
                  }</p>
                  {config.authType === 'agent' && config.publicKey && (
                    <p><strong>公钥:</strong> {config.publicKey.substring(0, 50)}...</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}