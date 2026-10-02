/** Fictional OAuth client files as Google Cloud downloads them (placeholders, never real). */
export const DESKTOP_CLIENT = {
  installed: {
    client_id: "000000000000-example.apps.googleusercontent.com",
    project_id: "acme-harbour",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    client_secret: "test-desktop-client-secret",
    redirect_uris: ["http://localhost"],
  },
};

export const WEB_CLIENT = {
  web: { ...DESKTOP_CLIENT.installed, redirect_uris: ["https://harbour.example.com/callback"] },
};
