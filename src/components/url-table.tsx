import { CopyIcon, ExternalLinkIcon, PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import type { ShortLink } from "@/api/urls"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"
import { isHttpUrl } from "@/lib/validation"

type Props = {
  links: readonly ShortLink[]
  onEdit: (link: ShortLink) => void
  onShowQr: (link: ShortLink) => void
  onDelete: (link: ShortLink) => void
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard", { description: text })
  } catch {
    toast.error("Couldn't copy. Select the link and copy it manually.")
  }
}

function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ExternalLink({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

function TargetUrl({ url }: { url: string }) {
  // Only http(s) targets become links; anything else is shown as plain text.
  const content = isHttpUrl(url) ? (
    <ExternalLink href={url} className="block truncate hover:underline">
      {url}
    </ExternalLink>
  ) : (
    <span className="block truncate" tabIndex={0}>
      {url}
    </span>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-md break-all">{url}</TooltipContent>
    </Tooltip>
  )
}

function CreatedAt({ value }: { value: string }) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return <span>{value}</span>
  return (
    <time dateTime={value} title={formatDateTime(date)} className="whitespace-nowrap">
      {formatRelativeTime(date)}
    </time>
  )
}

export function UrlTable({ links, onEdit, onShowQr, onDelete }: Props) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-64">Short URL</TableHead>
          <TableHead className="w-auto min-w-48">Target URL</TableHead>
          <TableHead className="w-32">Created</TableHead>
          <TableHead className="w-32 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => (
          <TableRow key={link.id}>
            <TableCell>
              <div className="flex items-center gap-1">
                <span className="truncate font-mono text-sm">{link.short_url}</span>
                <IconButton label={`Copy ${link.short_url}`} onClick={() => copy(link.short_url)}>
                  <CopyIcon />
                </IconButton>
                <IconButton label={`Open ${link.short_url}`} asChild>
                  <ExternalLink href={link.short_url}>
                    <ExternalLinkIcon />
                  </ExternalLink>
                </IconButton>
              </div>
            </TableCell>
            <TableCell className="max-w-0">
              <TargetUrl url={link.url} />
            </TableCell>
            <TableCell>
              <CreatedAt value={link.created_at} />
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <IconButton label={`Edit ${link.short_url}`} onClick={() => onEdit(link)}>
                  <PencilIcon />
                </IconButton>
                <IconButton label={`QR code for ${link.short_url}`} onClick={() => onShowQr(link)}>
                  <QrCodeIcon />
                </IconButton>
                <IconButton
                  label={`Delete ${link.short_url}`}
                  onClick={() => onDelete(link)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2Icon />
                </IconButton>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
