export type KyronAuthorizationServer = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
};

export type KyronOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresAt: string | null;
};

export type StoredKyronConnection = KyronOAuthTokens & {
  clientId: string;
  connectedAt: string;
  connectedBy: string;
};

// Calls one Kyron tool and returns its parsed data. The optional detail is
// added to the tool-call log entry.
export type KyronToolReader = (
  name: string,
  args: Record<string, unknown>,
  detail?: Record<string, unknown>,
) => Promise<unknown>;

export type KyronToolSession = {
  read: KyronToolReader;
  write: KyronToolReader;
};

export type PendingKyronAuthorization = {
  state: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
};
