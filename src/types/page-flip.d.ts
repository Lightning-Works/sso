/**
 * Ambient types for the `page-flip` package (StPageFlip).
 *
 * The published package ships no .d.ts, so this declares the slice of
 * its API the comic reader uses. Keep in sync with node_modules/page-flip
 * if the library is upgraded.
 */
declare module 'page-flip' {
  export interface PageFlipSettings {
    startPage?: number
    size?: 'fixed' | 'stretch'
    width?: number
    height?: number
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    drawShadow?: boolean
    flippingTime?: number
    usePortrait?: boolean
    startZIndex?: number
    autoSize?: boolean
    maxShadowOpacity?: number
    showCover?: boolean
    mobileScrollSupport?: boolean
    clickEventForward?: boolean
    useMouseEvents?: boolean
    swipeDistance?: number
    showPageCorners?: boolean
    disableFlipByClick?: boolean
  }

  /** Payload of a page-flip event. `data` is the new page index for
   *  'flip', or the state string for 'changeState'. */
  export interface WidgetEvent {
    data: number | string | boolean | object
    object: PageFlip
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: PageFlipSettings)
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    loadFromImages(images: string[]): void
    on(
      event: 'flip' | 'changeState' | 'changeOrientation' | 'init' | 'update',
      callback: (e: WidgetEvent) => void,
    ): PageFlip
    flip(page: number): void
    flipNext(): void
    flipPrev(): void
    turnToPage(page: number): void
    getCurrentPageIndex(): number
    getPageCount(): number
    getOrientation(): 'portrait' | 'landscape'
    update(): void
    destroy(): void
  }
}
