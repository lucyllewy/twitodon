export const mastodonHostCookieName = 'mastodonHost',
            mastodonTokenCookieName = 'mastodonToken',
            scopes = 'read:accounts' // read:follows write:follows

async function registerMastodonApp(mastodonHost, mastodonDomain, redirectUri) {
    const response = await fetch(`${mastodonHost}/api/v1/apps`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'client_name=twitodon' +
            `&redirect_uris=${encodeURIComponent(redirectUri)}` +
            `&scopes=${encodeURIComponent(scopes)}`
    })
    const {client_id: mastodon_client_id, client_secret: mastodon_client_secret}  = await response.json()
    await MASTODON_APPS.put(`client_id:${mastodonDomain}`, mastodon_client_id)
    await MASTODON_APPS.put(`client_secret:${mastodonDomain}`, mastodon_client_secret)
    return mastodon_client_id
}

export async function mastodonLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    const mastodonHost = searchParams.get('mastodonHost')
    const mastodonDomain = mastodonHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const redirectUri = `${protocol}//${hostname}${port ? `:${port}` : ''}/mastodonAuth`

    let mastodon_client_id = await MASTODON_APPS.get(`client_id:${mastodonDomain}`)
    if (!mastodon_client_id) {
        mastodon_client_id = await registerMastodonApp(mastodonHost, mastodonDomain, redirectUri)
    }

    return new Response(
        JSON.stringify({ mastodonLoginUrl: `${mastodonHost}/oauth/authorize?response_type=code&client_id=${mastodon_client_id}&redirect_uri=${redirectUri}&scope=${scopes}` }), {
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `mastodonHost=${mastodonHost}`,
        }
    })
}

export async function mastodonAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const mastodonHost = cookie[mastodonHostCookieName]
    const mastodonDomain = mastodonHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const redirectUri = `${protocol}//${hostname}${port ? `:${port}` : ''}/mastodonAuth`

    const mastodon_client_id = await MASTODON_APPS.get(`client_id:${mastodonDomain}`)
    const mastodon_client_secret = await MASTODON_APPS.get(`client_secret:${mastodonDomain}`)

    if (!mastodon_client_id || !mastodon_client_secret) {
        throw new Error('Where are my credentials?!')
    }

    const body = `code=${encodeURIComponent(searchParams.get('code'))}` +
                `&grant_type=${encodeURIComponent('authorization_code')}` +
                `&client_id=${encodeURIComponent(mastodon_client_id)}` +
                `&client_secret=${encodeURIComponent(mastodon_client_secret)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&scope=${encodeURIComponent(scopes)}`

    const oauthData = await fetch(`${cookie[mastodonHostCookieName]}/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    })

    const json = await oauthData.json()

    return new Response(null, {
        status: 301,
        headers: {
            location: `${protocol}//${hostname}${port ? `:${port}` : ''}/`,
            'Set-Cookie': `mastodonToken=${json.access_token}`,
        },
    })
}

export async function mastodonMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[mastodonTokenCookieName] == null) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }
    
    const me = await fetch(`${cookie[mastodonHostCookieName]}/api/v1/accounts/verify_credentials`, {
        headers: {
            Authorization: `Bearer ${cookie[mastodonTokenCookieName]}`,
        },
    })
    return await me.json()
}

// export async function downloadFollowableCSV(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
//     if (cookie[mastodonTokenCookieName] == null) {
//         throw new Error('No Mastodon Authorization Token cookie')
//     }
//     if (cookie[mastodonHostCookieName] == null) {
//         throw new Error('No Mastodon Hostname cookie')
//     }

//     // const mastodonUsers = await matchTwitterUsersToMastodon(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
//     const mastodonUsers = JSON.parse(requestBody)

//     return 'Account address,Show boosts\n' + mastodonUsers.map(user => `${user},true`).join('\n')
// }