/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_URL?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, string>): void;
  prompt(): void;
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
