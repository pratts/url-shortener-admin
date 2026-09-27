import { DownloadIcon } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useRef } from "react"
import { toast } from "sonner"
import type { ShortLink } from "@/api/urls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PNG_SIZE = 1024

function download(href: string, filename: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  a.click()
}

function svgBlob(svg: SVGSVGElement) {
  const xml = new XMLSerializer().serializeToString(svg)
  return new Blob([xml], { type: "image/svg+xml" })
}

async function svgToPngDataUrl(svg: SVGSVGElement, size: number) {
  const url = URL.createObjectURL(svgBlob(svg))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is not supported")
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, size, size)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function QrCodeDialog({
  link,
  onOpenChange,
}: {
  link: ShortLink | null
  onOpenChange: (open: boolean) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const filename = link ? `tidylnk-${link.short_code}` : "tidylnk"

  const downloadSvg = () => {
    if (!svgRef.current) return
    const url = URL.createObjectURL(svgBlob(svgRef.current))
    download(url, `${filename}.svg`)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const downloadPng = async () => {
    if (!svgRef.current) return
    try {
      download(await svgToPngDataUrl(svgRef.current, PNG_SIZE), `${filename}.png`)
    } catch {
      toast.error("Couldn't create the PNG. Try downloading the SVG instead.")
    }
  }

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription className="font-mono break-all">{link?.short_url}</DialogDescription>
        </DialogHeader>
        {link && (
          <div className="flex justify-center rounded-lg bg-white p-4">
            <QRCodeSVG
              ref={svgRef}
              value={link.short_url}
              size={224}
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#000000"
              title={`QR code for ${link.short_url}`}
              role="img"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={downloadSvg}>
            <DownloadIcon /> Download SVG
          </Button>
          <Button onClick={downloadPng}>
            <DownloadIcon /> Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
