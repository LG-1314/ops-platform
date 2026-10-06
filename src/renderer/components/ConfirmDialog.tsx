import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material'

interface Props {
  open: boolean
  title?: string
  content: React.ReactNode
  confirmText?: string
  /** 危险操作（默认）：确认按钮用 error 色 */
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** 统一的破坏性操作确认弹窗。
 *  此前 Alerts 规则 / Automation 事故与流水线 / Patrols 任务（含批量）/
 *  Knowledge / Settings 通知渠道等删除都是单击图标立即执行，与其他页面的
 *  确认模式不一致且易误触；统一收敛到本组件。 */
export default function ConfirmDialog({
  open,
  title = '确认操作',
  content,
  confirmText = '删除',
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{content}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={onConfirm}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
