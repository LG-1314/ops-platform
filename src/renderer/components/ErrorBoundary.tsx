import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Box, Button, Typography, Stack } from '@mui/material'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// 渲染异常边界：捕获任意页面/组件的渲染错误，兜底展示可恢复的友好界面，
// 避免单个页面抛错导致整页白屏（Electron 环境无 dev overlay 时尤其致命）。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] 渲染异常已捕获：', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          p={3}
          bgcolor="background.default"
        >
          <Box textAlign="center" maxWidth={520}>
            <Typography variant="h5" gutterBottom color="text.primary">
              页面出错了
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              渲染过程中发生异常，已阻止整页黑屏。可尝试重试；若问题持续，请查看控制台日志。
            </Typography>
            <Box
              component="pre"
              sx={{
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontSize: 12,
                color: 'text.secondary',
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                mb: 2,
              }}
            >
              {error.message}
            </Box>
            <Stack direction="row" spacing={1} justifyContent="center">
              <Button variant="contained" onClick={this.handleRetry}>
                重试
              </Button>
              <Button variant="outlined" onClick={this.handleReload}>
                重新加载
              </Button>
            </Stack>
          </Box>
        </Box>
      )
    }
    return this.props.children
  }
}
