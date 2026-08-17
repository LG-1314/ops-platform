import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
} from '@mui/material'
import {
  Hub,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Palette,
  Description,
  Security,
} from '@mui/icons-material'
import { api } from '../../capabilities/bus'
import PageHeader from '../components/PageHeader'

export default function Settings() {
  const theme = useTheme()
  const [health, setHealth] = useState<boolean | null>(null)

  useEffect(() => {
    api.health()
      .then((r) => setHealth(r.ok))
      .catch(() => setHealth(false))
  }, [])

  return (
    <Box>
      <PageHeader title="设置" subtitle="能力总线连接、主题与导出偏好" />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            能力总线（Express 8787）
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            {health === null ? (
              <CircularProgress size={18} />
            ) : health ? (
              <Chip
                icon={<CheckCircle />}
                label="已连接 · 所有运维能力在线"
                color="success"
                variant="outlined"
              />
            ) : (
              <Chip label="连接失败" color="error" variant="outlined" />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <Palette sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1">主题与视觉规范</Typography>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label="主色 #3D7BFF" variant="outlined" />
            <Chip label="深色背景 #0B0E14" variant="outlined" />
            <Chip label="卡片圆角 8px" variant="outlined" />
            <Chip size="small" icon={<CheckCircle color="success" />} label="正常" variant="outlined" />
            <Chip size="small" icon={<Warning color="warning" />} label="警告" variant="outlined" />
            <Chip size="small" icon={<ErrorIcon color="error" />} label="严重" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            模块与能力
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <List dense>
            <ListItem>
              <ListItemIcon><Hub /></ListItemIcon>
              <ListItemText primary="统一资产纳管 / 智能接入" secondary="运维搭子" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Security /></ListItemIcon>
              <ListItemText primary="全栈诊断 / 等保基线" secondary="TencentOS 全栈诊断" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Description /></ListItemIcon>
              <ListItemText primary="知识检索 / 关联视图" secondary="运维监控 FAQ 知识库" />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Box>
  )
}
