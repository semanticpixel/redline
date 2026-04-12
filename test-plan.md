# Refactor Authentication System to OAuth 2.0 + PKCE

## Context
The app currently uses a custom JWT-based auth system with username/password login. We need to migrate to OAuth 2.0 with PKCE flow to support SSO providers (Google, GitHub, Microsoft) while maintaining backward compatibility with existing sessions.

## Phase 1: Database Schema Changes

### 1. Create oauth_providers table
Store provider configurations (`client_id`, `client_secret`, `discovery_url`, `scopes`). Support Google, GitHub, and Microsoft initially. Include an enabled boolean for feature flagging per provider.

```sql
CREATE TABLE oauth_providers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret VARCHAR(255) NOT NULL,
  discovery_url TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Create oauth_connections table
Links users to their OAuth provider accounts. Columns: user_id, provider_id, provider_user_id, access_token (encrypted), refresh_token (encrypted), token_expires_at, created_at. A user can have multiple provider connections.

### 3. Add auth_method column to users table
Enum: password, oauth, both. Default to password for existing users. New OAuth-only users get oauth. Users who link both get both.

```sql
ALTER TABLE users ADD COLUMN auth_method VARCHAR(10) DEFAULT 'password';
UPDATE users SET auth_method = 'password' WHERE auth_method IS NULL;
```

### 4. Create auth_sessions table
Replace the current JWT-only approach with server-side sessions. Columns: session_id (UUID), user_id, created_at, expires_at, last_active_at, ip_address, user_agent, auth_method_used.

### 5. Write migration scripts
Forward migration: create tables, backfill auth_method for existing users. Rollback migration: drop new tables, remove auth_method column.

## Phase 2: Backend Implementation

### 6. Implement PKCE flow utilities
Generate code_verifier, compute code_challenge (SHA256 + base64url), and validate the exchange.

```typescript
import crypto from 'node:crypto';

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function computeCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}
```

### 7. Create /auth/oauth/authorize endpoint
Accepts provider name, generates state parameter, generates PKCE code_verifier/challenge, redirects to provider.

```typescript
app.get('/auth/oauth/authorize/:provider', async (req, res) => {
  const provider = await getProvider(req.params.provider);
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);

  await redis.set(`oauth:state:${state}`, JSON.stringify({
    codeVerifier,
    provider: provider.name,
  }), 'EX', 600);

  const authUrl = new URL(provider.discovery_url + '/authorize');
  authUrl.searchParams.set('client_id', provider.client_id);
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', provider.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authUrl.toString());
});
```

### 8. Create /auth/oauth/callback endpoint
Receives authorization code, validates state, exchanges code for tokens, fetches user profile, creates or links user account.

## Phase 3: Frontend Changes

### 9. Build OAuth login buttons component
Show available providers on login page. Each button initiates the PKCE flow.

```tsx
function OAuthButtons({ providers }: { providers: Provider[] }) {
  return (
    <div className="oauth-buttons">
      {providers.filter(p => p.enabled).map(provider => (
        <button
          key={provider.name}
          onClick={() => window.location.href = `/auth/oauth/authorize/${provider.name}`}
          className={`oauth-btn oauth-btn--${provider.name}`}
        >
          <ProviderIcon name={provider.name} />
          Continue with {provider.name}
        </button>
      ))}
    </div>
  );
}
```

### 10. Build account linking UI
Settings page section showing connected providers. Toggle to connect/disconnect each provider.

## Verification
1. Existing password login still works unchanged
2. Google OAuth login creates new account with correct auth_method
3. Revoking a session immediately invalidates it
