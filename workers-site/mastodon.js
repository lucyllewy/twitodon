import { matchTwitterUsersToMastodon } from './user-matching'

export const mastodonHostCookieName = 'mastodonHost',
            mastodonTokenCookieName = 'mastodonToken'

export async function mastodonLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    return new Response(
        JSON.stringify({ mastodonLoginUrl: `${searchParams.get('mastodonHost')}/oauth/authorize?response_type=code&client_id=${mastodon_client_id}&redirect_uri=${protocol}//${hostname}${port ? `:${port}` : ''}/mastodonAuth&scope=read:accounts+read:follows+write:follows` }), {
        'Content-Type': 'application/json',
        'Set-Cookie': `mastodonHost=${searchParams.get('mastodonHost')}`,
    })
}

export async function mastodonAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }
    const body = `code=${encodeURIComponent(searchParams.get('code'))}&` +
    `grant_type=${encodeURIComponent('authorization_code')}&` +
    `client_id=${encodeURIComponent(mastodon_client_id)}&` +
    `client_secret=${encodeURIComponent(mastodon_client_secret)}&` +
    `redirect_uri=${encodeURIComponent(`${protocol}//${hostname}${port ? `:${port}` : ''}/mastodonAuth`)}&` +
    `scope=read:accounts read:follows write:follows`
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

export async function downloadFollowableCSV(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[mastodonTokenCookieName] == null) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const mastodonUsers = await matchTwitterUsersToMastodon(cookie, protocol, hostname, port, pathname, searchParams, requestBody)

    return 'Account address,Show boosts\n' + mastodonUsers.map(user => `${user},true`).join('\n')
}