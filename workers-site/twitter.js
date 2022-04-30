import { randomBytes } from 'crypto'

export const twitterChallengeCookieName = 'twitterChallenge',
            twitterTokenCookieName = 'twitterToken'

export async function twitterLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    const challenge = randomBytes(20).toString('hex')
    const redirectUri = `${protocol}//${hostname}${port ? `:${port}` : ''}/twitterAuth`
    console.dir(client_id)
    return new Response(JSON.stringify({ twitterLoginUrl: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${client_id}&redirect_uri=${redirectUri}&scope=tweet.read%20users.read%20follows.read&state=state&code_challenge=${challenge}&code_challenge_method=plain` }), {
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `${twitterChallengeCookieName}=${challenge}`,
        },
    })
}

export async function twitterAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterChallengeCookieName] == null) {
        throw new Error('No Twitter Challenge cookie')
    }
    const redirectUri = `${protocol}//${hostname}${port ? `:${port}` : ''}/twitterAuth`
    const body = `code=${encodeURIComponent(searchParams.get('code'))}&` +
    `grant_type=${encodeURIComponent('authorization_code')}&` +
    `client_id=${encodeURIComponent(client_id)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `code_verifier=${encodeURIComponent(cookie[twitterChallengeCookieName])}`
    const oauthData = await fetch('https://api.twitter.com/2/oauth2/token', {
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
            'Set-Cookie': `twitterToken=${json.access_token}`,
        }
    })
}

export async function twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterTokenCookieName] == null) {
        throw new Error('No Twitter Authorization Token cookie')
    }
    const me = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
            Authorization: `Bearer ${cookie[twitterTokenCookieName]}`,
        },
    })
    return await me.json() 
}

export async function followingOnTwitter(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterTokenCookieName] == null) {
        throw new Error('No Twitter Authorization Token cookie')
    }

    const userId = (await twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)).data.id
    
    async function getPage(nextToken) {
        return await fetch(`https://api.twitter.com/2/users/${userId}/following?max_results=1000${nextToken ? `&pagination_token=${nextToken}` : ''}`, {
            headers: {
                Authorization: `Bearer ${cookie[twitterTokenCookieName]}`,
            },
        })
    }

    let hasNextPage = true;
    let nextToken = null;
    const users = []
    while (hasNextPage) {
        const following = await getPage(nextToken)
        const resp = await following.json()
        if ('status' in resp && resp.status !== 200) {
            break;
        }
        if (resp && resp.meta && resp.meta.result_count && resp.meta.result_count > 0) {
            if (resp.data) {
                users.push(resp.data);
            }
            if (resp.meta.next_token) {
                nextToken = resp.meta.next_token;
            } else {
                hasNextPage = false;
            }
        } else {
            hasNextPage = false;
        }
    }

    return users.flat(1)
}