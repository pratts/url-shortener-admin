import { LinkIcon, PlusIcon, RotateCwIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ApiError } from "@/api/client"
import type { ShortLink } from "@/api/urls"
import { QrCodeDialog } from "@/components/qr-code-dialog"
import { UrlFormDialog } from "@/components/url-form-dialog"
import { UrlTable } from "@/components/url-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useDeleteUrl, useShortLinkHosts, useUrls } from "@/hooks/use-urls"

type FormState = { open: false } | { open: true; link?: ShortLink }

export default function Urls() {
  const urls = useUrls()
  const links = useMemo(() => urls.data?.pages.flatMap((page) => page.items) ?? [], [urls.data])
  const shortLinkHosts = useShortLinkHosts(links)

  const [form, setForm] = useState<FormState>({ open: false })
  const [qrLink, setQrLink] = useState<ShortLink | null>(null)
  const [deleting, setDeleting] = useState<ShortLink | null>(null)
  const deleteMutation = useDeleteUrl()

  const confirmDelete = async (event: React.MouseEvent) => {
    event.preventDefault() // keep the dialog open until the request finishes
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success("Link deleted")
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        toast.error("This link no longer exists")
      } else {
        toast.error(error instanceof ApiError ? error.message : "Couldn't delete the link.")
        return
      }
    }
    setDeleting(null)
  }

  const openCreate = () => setForm({ open: true })
  const loadMoreError = urls.isFetchNextPageError ? urls.error : null

  let content: React.ReactNode
  if (urls.isPending) {
    content = (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading links">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  } else if (urls.isError) {
    content = (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{urls.error instanceof ApiError ? urls.error.message : "Couldn't load your links."}</span>
          <Button size="sm" variant="outline" onClick={() => urls.refetch()}>
            <RotateCwIcon /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (links.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LinkIcon />
          </EmptyMedia>
          <EmptyTitle>No links yet</EmptyTitle>
          <EmptyDescription>Create a short link and it will show up here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={openCreate}>
            <PlusIcon /> Create your first link
          </Button>
        </EmptyContent>
      </Empty>
    )
  } else {
    content = (
      <div className="grid gap-4">
        <div className="rounded-lg border">
          <UrlTable
            links={links}
            onEdit={(link) => setForm({ open: true, link })}
            onShowQr={setQrLink}
            onDelete={setDeleting}
          />
        </div>
        {loadMoreError && (
          <Alert variant="destructive">
            <AlertDescription>
              {loadMoreError instanceof ApiError ? loadMoreError.message : "Couldn't load more links."}
            </AlertDescription>
          </Alert>
        )}
        {urls.hasNextPage && (
          <Button
            variant="outline"
            className="justify-self-center"
            onClick={() => urls.fetchNextPage()}
            disabled={urls.isFetchingNextPage}
          >
            {urls.isFetchingNextPage && <Spinner />}
            Load more
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Links</h1>
          <p className="text-sm text-muted-foreground">Your short links, newest first.</p>
        </div>
        {links.length > 0 && (
          <Button onClick={openCreate}>
            <PlusIcon /> Create link
          </Button>
        )}
      </div>

      {content}

      <UrlFormDialog
        open={form.open}
        link={form.open ? form.link : undefined}
        onOpenChange={(open) => !open && setForm({ open: false })}
        shortLinkHosts={shortLinkHosts}
      />
      <QrCodeDialog link={qrLink} onOpenChange={(open) => !open && setQrLink(null)} />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono break-all">{deleting?.short_url}</span> will stop working
              and its click history will be deleted. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
