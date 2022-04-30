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
    const json = await response.text()
    const {client_id, client_secret} = JSON.parse(json)
    await MASTODON_APPS.put(`client_id:${mastodonDomain}`, client_id)
    await MASTODON_APPS.put(`client_secret:${mastodonDomain}`, client_secret)
    return client_id
}

export async function mastodonLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    const mastodonHost = searchParams.get('mastodonHost')
    const mastodonDomain = mastodonHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    const redirectUri = `${protocol}//${hostname}${port ? `:${port}` : ''}/mastodonAuth`

    let client_id = await MASTODON_APPS.get(`client_id:${mastodonDomain}`)
    if (!client_id) {
        client_id = await registerMastodonApp(mastodonHost, mastodonDomain, redirectUri)
    }

    return new Response(
        JSON.stringify({ mastodonLoginUrl: `${mastodonHost}/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${redirectUri}&scope=${scopes}` }), {
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

    const client_id = await MASTODON_APPS.get(`client_id:${mastodonDomain}`)
    const client_secret = await MASTODON_APPS.get(`client_secret:${mastodonDomain}`)

    if (!client_id || !client_secret) {
        throw new Error('Where are my credentials?!')
    }

    const body = `code=${encodeURIComponent(searchParams.get('code'))}` +
                `&grant_type=${encodeURIComponent('authorization_code')}` +
                `&client_id=${encodeURIComponent(client_id)}` +
                `&client_secret=${encodeURIComponent(client_secret)}` +
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