import { useEffect, useState } from 'react'
import SSHMain from './SSHMain'
import SSHConfig from './SSHConfig'
import SSHCommand from './SSHCommand'

export default function App () {
  const [enterAction, setEnterAction] = useState({})
  const [route, setRoute] = useState('')

  useEffect(() => {
    window.utools.onPluginEnter((action) => {
      setRoute(action.code)
      setEnterAction(action)
    })
    window.utools.onPluginOut((isKill) => {
      setRoute('')
    })
  }, [])

  // SSH 相关路由
  if (route === 'ssh-main') {
    return <SSHMain enterAction={enterAction} />
  }

  if (route === 'ssh-config') {
    return <SSHConfig enterAction={enterAction} />
  }

  if (route === 'ssh-command') {
    return <SSHCommand enterAction={enterAction} />
  }

  // 如果是未知路由，默认显示SSH主界面

  // 默认显示 SSH 主界面
  return <SSHMain enterAction={enterAction} />
}
