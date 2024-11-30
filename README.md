# gdrive-webdav

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/colobas/gdrive-webdav)

Use Cloudflare Workers to provide a WebDav interface for Google Drive.

## Usage

Change wrangler.toml to your own.

```bash
wrangler deploy

# to authenticate the WebDav client
wrangler secret put USERNAME
wrangler secret put PASSWORD

# to authenticate the Google Drive API
wrangler secret put CLIENT_ID
wrangler secret put CLIENT_SECRET
wrangler secret put REFRESH_TOKEN
wrangler secret put ROOT_FOLDER_ID
```

## Development

With `wrangler`, you can build, test, and deploy your Worker with the following commands:

```sh
# run your Worker in an ideal development workflow (with a local server, file watcher & more)
$ npm run dev

# deploy your Worker globally to the Cloudflare network (update your wrangler.toml file for configuration)
$ npm run deploy
```

## Test

Use [litmus](https://github.com/notroj/litmus) to test.
