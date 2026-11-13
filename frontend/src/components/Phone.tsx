import type { ReactNode } from 'react'
import { ChevronLeft, Instagram, Phone as PhoneIcon, Video } from 'lucide-react'
import type { Account } from '../api'
import { useI18n } from '../i18n'
import { Avatar } from './ui'

/** Akkaunt rasmi + Instagram belgisi. */
export function IgAvatar({ account, size = 44 }: { account: Account | null; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Avatar name={account?.username || '?'} src={account?.picture_url} size={size} />
      <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] ring-2 ring-white"
        style={{ width: size * 0.42, height: size * 0.42 }}>
        <Instagram className="text-white" style={{ width: size * 0.26, height: size * 0.26 }} strokeWidth={2.5} />
      </span>
    </span>
  )
}

/** iPhone ko'rinishidagi ramka, tepasida Instagram Direct sarlavhasi. */
export function PhoneFrame({ account, children, footer, className = '' }: {
  account: Account | null; children: ReactNode; footer?: ReactNode; className?: string
}) {
  const name = account?.name || account?.username || 'Instagram'
  return (
    <div className={`flex flex-col rounded-[46px] border border-[#cfcfd6] bg-white p-[9px] shadow-[0_30px_60px_-30px_rgba(20,20,30,.35)] ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[38px] bg-white">
        <div className="flex items-center gap-2.5 border-b border-[#efeff2] px-4 pb-2.5 pt-5">
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <Avatar name={name} src={account?.picture_url} size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            <div className="truncate text-[11px] text-ink-3">@{account?.username || 'username'}</div>
          </div>
          <PhoneIcon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.8} />
          <Video className="h-[21px] w-[21px] shrink-0" strokeWidth={1.8} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-white to-[#fafafb]">{children}</div>
        {footer}
        <div className="flex justify-center pb-2 pt-1.5"><span className="h-[5px] w-28 rounded-full bg-ink" /></div>
      </div>
    </div>
  )
}

/** Suhbat boshidagi profil kartasi (Instagram'dagidek). */
export function ProfileIntro({ account }: { account: Account | null }) {
  const { t } = useI18n()
  const name = account?.name || account?.username || 'Instagram'
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Avatar name={name} src={account?.picture_url} size={76} />
      <div className="mt-3 text-[17px] font-bold">{name}</div>
      <div className="text-[13px] text-ink-3">{account?.followers ? t('sim.followers', { n: account.followers.toLocaleString('ru-RU') }) : `@${account?.username || ''} · Instagram`}</div>
    </div>
  )
}
