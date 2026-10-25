/** A file read as text without its byte-order mark: Windows editors and PowerShell 5 write one, and `JSON.parse` refuses it. */
export const unbom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
