// Minimal ambient types for the (untyped) qrcode browser build we use in
// src/app/aw/features/Receive.tsx. Only the one call we make is declared.
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    margin?: number
    width?: number
    color?: { dark?: string; light?: string }
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>
}
