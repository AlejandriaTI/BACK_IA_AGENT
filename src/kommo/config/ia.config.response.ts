export interface AIResponse {
  content:
    | string
    | Buffer
    | {
        isAudio: boolean;
        message?: string;
        mimeType: string;
        base64: string;
      };
  registro: any;
}
