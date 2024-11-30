export interface Env {
  // Google Drive API credentials
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  REFRESH_TOKEN: string;
  ROOT_FOLDER_ID: string;

  // Auth credentials
  USERNAME: string;
  PASSWORD: string;
}

// Google Drive API client
class DriveClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private env: Env) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.env.CLIENT_ID,
      client_secret: this.env.CLIENT_SECRET,
      refresh_token: this.env.REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    });

    const data = await response.json();

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    return this.accessToken;
  }

  async listFiles(parentId: string, recursive: boolean = false): Promise<any[]> {
    const token = await this.getAccessToken();
    let files = [];
    let pageToken = null;

    do {
      const query = `'${parentId}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,createdTime,modifiedTime),nextPageToken${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      files = files.concat(data.files);
      pageToken = data.nextPageToken;

      if (recursive) {
        for (const file of data.files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            const subFiles = await this.listFiles(file.id, true);
            files = files.concat(subFiles);
          }
        }
      }
    } while (pageToken);

    return files;
  }

  async getResourceId(path: string, parentId: string): Promise<string> {
    const parts = path.split('/');
    let currentParentId = parentId;
	console.log("getting resourceId", path, parentId);

    for (const part of parts) {
      const files = await this.listFiles(currentParentId);
      const file = files.find(f => f.name === part);
      if (!file) {
        return '';
      }
      currentParentId = file.id;
    }

	if (currentParentId === parentId) {
		return '';
	}

	return currentParentId;
  }

  async getFile(path: string): Promise<Response> {
	const fileId = await this.getResourceId(path, this.env.ROOT_FOLDER_ID);
	if (fileId === '') {
		return new Response('Not Found', { status: 404 });
	}

    const token = await this.getAccessToken();
    return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async getResourceInfo(path: string): Promise<any> {
	const fileId = (path === '' || path === '/') ? this.env.ROOT_FOLDER_ID : await this.getResourceId(path, this.env.ROOT_FOLDER_ID);

	if (fileId === '') {
		return null;
	}

    const token = await this.getAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  }

  async uploadFile(parentId: string, name: string, content: ArrayBuffer, mimeType: string): Promise<any> {
    const token = await this.getAccessToken();
    const metadata = {
      name,
      parents: [parentId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: mimeType }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: form,
    });

    return response.json();
  }

  async deleteFile(path: string): Promise<void> {
	const fileId = await this.getResourceId(path, this.env.ROOT_FOLDER_ID);
	if (fileId === '') {
		return;
	}

    const token = await this.getAccessToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async createFolder(path: string): Promise<any> {
	// divide path into name and parts
	const parts = path.split('/').filter(p => p.length > 0);
	const name = parts.pop() || '';
	const parentPath = parts.join('/');

	let parentId;
	if (parts.length > 0) {
		parentId = await this.getResourceId(parentPath, this.env.ROOT_FOLDER_ID);
		if (parentId === '' || parentId === null) {
			parentId = await this.createFolder(parentPath);
		}
	} else {
		parentId = this.env.ROOT_FOLDER_ID;
	}

	const response = await this.createFolderWithParentId(parentId, name);
	return response.id;
  }

  private async createFolderWithParentId(parentId: string, name: string): Promise<any> {
    const token = await this.getAccessToken();
    const metadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

	if (response.status !== 200) {
		throw new Error("Failed to create folder");
	}

	return response.json();
  }
}

function make_resource_path(request: Request): string {
  let path = new URL(request.url).pathname.slice(1);
  path = path.endsWith('/') ? path.slice(0, -1) : path;
  return path;
}

async function handle_get(request: Request, driveClient: DriveClient): Promise<Response> {
  const path = make_resource_path(request);
  
  if (request.url.endsWith('/')) {
    // List directory contents
	const parentId = (path === '' || path === '/') ? driveClient.env.ROOT_FOLDER_ID : await driveClient.getResourceId(path, driveClient.env.ROOT_FOLDER_ID);
    const files = await driveClient.listFiles(parentId);

	console.log("Got x children", files.length);

    let page = '';
    
    if (path !== '') {
      page += `<a href="../">..</a><br>`;
    }

    for (const file of files) {
       const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
       const href = `/${path}/${file.name}${isFolder ? '/' : ''}`.replace(/\/+/g, '/'); // Ensure path starts with / and normalize multiple slashes
       page += `<a href="${href}">${file.name}</a><br>`;
    }

    const pageSource = `<!DOCTYPE html>
      <html>
        <head>
          <title>Google Drive WebDAV</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            a { display: block; padding: 5px; text-decoration: none; }
            a:hover { background: #eee; }
          </style>
        </head>
        <body>
          <h1>Google Drive WebDAV</h1>
          ${page}
        </body>
      </html>`;

    return new Response(pageSource, {
      headers: { 'Content-Type': 'text/html' },
    });
  } else {
    // Get file contents
    return await driveClient.getFile(path);
  }
}

async function handle_head(request: Request, driveClient: DriveClient): Promise<Response> {
  const path = make_resource_path(request);
  const resource = await driveClient.getResourceInfo(path);
  if (!resource) {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(null, { status: 200 });
}

async function handle_put(request: Request, driveClient: DriveClient): Promise<Response> {
  const path = make_resource_path(request);
  const content = await request.arrayBuffer();
  const mimeType = request.headers.get('Content-Type') || 'application/octet-stream';
  console.log(path, mimeType);

  // Split path into parts and get parent folder path
  const parts = path.split('/').filter(p => p);
  const fileName = parts.pop() || '';
  const parentPath = parts.join('/');
  console.log("parentPath", parentPath);

  // Get or create parent folder
  let parentId;
  if (parentPath) {
    const parentFolder = await driveClient.getResourceInfo(parentPath);
    if (parentFolder) {
      parentId = parentFolder.id;
    } else {
      // Create missing parent folder
      parentId = await driveClient.createFolder(parentPath);
    }
  } else {
    parentId = driveClient.env.ROOT_FOLDER_ID;
  }
 
  await driveClient.uploadFile(parentId, fileName, content, mimeType);
  return new Response(null, { status: 201 });
}

async function handle_delete(request: Request, driveClient: DriveClient): Promise<Response> {
  const path = make_resource_path(request);
  await driveClient.deleteFile(path);
  return new Response(null, { status: 204 });
}

async function handle_mkcol(request: Request, driveClient: DriveClient): Promise<Response> {
  const path = make_resource_path(request);
  await driveClient.createFolder(path);
  return new Response(null, { status: 201 });
}

async function handle_propfind(request: Request, driveClient: DriveClient): Promise<Response> {
	const path = make_resource_path(request);
	const depth = request.headers.get('Depth') || 'infinity';

	// Get file/folder info
	const resource = await driveClient.getResourceInfo(path);
	if (!resource) {
		return new Response('Not Found', { status: 404 });
	}

	console.log("Got resource", resource);

	// Build basic XML response
	let responseXml = `<?xml version="1.0" encoding="utf-8" ?>
		<D:multistatus xmlns:D="DAV:">
			<D:response>
				<D:href>${path}</D:href>
				<D:propstat>
					<D:prop>
						<D:resourcetype>${resource.mimeType === 'application/vnd.google-apps.folder' ? '<D:collection/>' : ''}</D:resourcetype>
						<D:getcontentlength>${resource.size || 0}</D:getcontentlength>
						<D:getlastmodified>${new Date(resource.modifiedTime).toUTCString()}</D:getlastmodified>
						<D:creationdate>${new Date(resource.createdTime).toISOString()}</D:creationdate>
						<D:getcontenttype>${resource.mimeType}</D:getcontenttype>
					</D:prop>
					<D:status>HTTP/1.1 200 OK</D:status>
				</D:propstat>
			</D:response>`;

	// Add child resources if depth > 0 and resource is a folder
	if (depth !== '0' && resource.mimeType === 'application/vnd.google-apps.folder') {
		const children = await driveClient.listFiles(resource.id);
		for (const child of children) {
			const childPath = `${path}${path.endsWith('/') ? '' : '/'}${child.name}`;
			responseXml += `
				<D:response>
					<D:href>${childPath}</D:href>
					<D:propstat>
						<D:prop>
							<D:resourcetype>${child.mimeType === 'application/vnd.google-apps.folder' ? '<D:collection/>' : ''}</D:resourcetype>
							<D:getcontentlength>${child.size || 0}</D:getcontentlength>
							<D:getlastmodified>${new Date(child.modifiedTime).toUTCString()}</D:getlastmodified>
							<D:creationdate>${new Date(child.createdTime).toISOString()}</D:creationdate>
							<D:getcontenttype>${child.mimeType}</D:getcontenttype>
						</D:prop>
						<D:status>HTTP/1.1 200 OK</D:status>
					</D:propstat>
				</D:response>`;
		}
	}

	responseXml += '</D:multistatus>';

	return new Response(responseXml, {
		status: 207,
		headers: {
			'Content-Type': 'application/xml; charset=utf-8'
		}
	});
}

async function handle_proppatch(request: Request, driveClient: DriveClient): Promise<Response> {
	// WebDAV PROPPATCH is mainly used for setting custom properties
	// Google Drive doesn't support custom properties in the same way
	// Return a basic success response
	return new Response(`<?xml version="1.0" encoding="utf-8" ?>
		<D:multistatus xmlns:D="DAV:">
			<D:response>
				<D:href>${make_resource_path(request)}</D:href>
				<D:propstat>
					<D:status>HTTP/1.1 200 OK</D:status>
				</D:propstat>
			</D:response>
		</D:multistatus>`, {
		status: 207,
		headers: {
			'Content-Type': 'application/xml; charset=utf-8'
		}
	});
}


function is_authorized(authorization_header: string, username: string, password: string): boolean {
  const encoder = new TextEncoder();
  const header = encoder.encode(authorization_header);
  const expected = encoder.encode(`Basic ${btoa(`${username}:${password}`)}`);
  return header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Check authentication
    if (
      request.method !== 'OPTIONS' &&
      !is_authorized(request.headers.get('Authorization') ?? '', env.USERNAME, env.PASSWORD)
    ) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="webdav"',
        },
      });
    }

    const driveClient = new DriveClient(env);

    // Handle request based on method
    try {
      switch (request.method) {
        case 'GET':
          return await handle_get(request, driveClient);
		case 'HEAD':
		  return await handle_head(request, driveClient);
        case 'PUT': 
          return await handle_put(request, driveClient);
        case 'DELETE':
          return await handle_delete(request, driveClient);
        case 'MKCOL':
          return await handle_mkcol(request, driveClient);
        case 'PROPFIND':
          return await handle_propfind(request, driveClient);
        case 'PROPPATCH':
          return await handle_proppatch(request, driveClient);
        case 'OPTIONS':
          return new Response(null, {
            status: 204,
            headers: {
              'Allow': 'GET, PUT, DELETE, MKCOL, PROPFIND, PROPPATCH, OPTIONS',
              'DAV': '1,2'
            },
          });
        default:
          return new Response('Method Not Allowed', { status: 405 });
      }
    } catch (error) {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
