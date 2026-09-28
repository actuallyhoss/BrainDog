# Reaching it: TLS and sign-in

To use your BrainDog from a phone or another machine, it needs a server key, so that people sign in, and a name with a certificate, so that a browser will keep a session and make a passkey. There are three ways to arrange that, and only three.

## The server key

`BRAINDOG_TOKEN` is the server key. Without it, the server listens on this machine only and treats every request as the owner's. With it, the server listens on every interface, every request has to be signed in, and the app offers sign-in at `<origin>/signin`: with a passkey where the name allows one, or with the server key itself.

Make it long and random, keep it in a file only the server's user can read, and treat it as the master key it is. The command line holding it may export, import and mint agent keys without asking in the app.

## Three ways to serve it

```comparison | The ways to serve a self-hosted BrainDog
Way | Settings | When
On this machine only | none | a record only you use, from this machine; a browser treats localhost as secure
TLS here | BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY | you hold a certificate for the machine's name
TLS in front | BRAINDOG_ORIGIN and BRAINDOG_TRUST_PROXY=1 | a proxy or a tunnel answers at the name and forwards to this server
```

~~~code | As written
```comparison | The ways to serve a self-hosted BrainDog
Way | Settings | When
On this machine only | none | a record only you use, from this machine; a browser treats localhost as secure
TLS here | BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY | you hold a certificate for the machine's name
TLS in front | BRAINDOG_ORIGIN and BRAINDOG_TRUST_PROXY=1 | a proxy or a tunnel answers at the name and forwards to this server
```
~~~

## TLS here

`BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY` name the certificate file and its private key file, both PEM. They are paths, never the values, so the key is never in the environment of every process. Set both or neither: one alone is refused, rather than quietly serving plain http after you asked for TLS.

Before it starts, the server checks that the certificate is a certificate, that the key is a key, and that the key is the one the certificate was made for, and names the file that is wrong if not. It takes its name from the certificate, so `BRAINDOG_ORIGIN` is not needed; if you set it anyway, a name the certificate does not cover is refused. A key file readable by others on the machine is warned about and not refused, because a certificate renewed by an ACME client is often handed out that way on purpose.

## TLS in front

Put a reverse proxy or a tunnel in front, let it hold the certificate, and tell the server the name it answers at:

```code | The two settings
BRAINDOG_ORIGIN=https://braindog.example.com
BRAINDOG_TRUST_PROXY=1
```

`BRAINDOG_TRUST_PROXY=1` makes the server read the client's address from the proxy, so the sign-in lockout counts the person trying rather than the proxy. Only set it when every request really comes through the proxy.

## Names, not addresses

A passkey is bound to a domain name, never to an address. At `https://192.168.1.50:8443` sign-in works with the server key and a passkey can never be made, and the server says so when it starts. Give the machine a name, on your own network or a public one, with a certificate for that name.

A self-signed certificate is not one of the ways. A phone installs BrainDog as an app only from a page with a certificate it trusts, so clicking through a warning gives a web page and never the installed app.

Changing the name later, a new `BRAINDOG_ORIGIN` or a certificate for another name, retires every passkey made at the old one, on every device. The server remembers the name it last served at and says so on the first start at a new one.

## Mail

Sign-in links, invitations and notifications go out by mail only when the server can send it:

```code | Mail settings
BRAINDOG_SMTP_URL=smtps://user:password@mail.example.com:465
BRAINDOG_MAIL_FROM=braindog@example.com
```

`smtps://` is TLS from the first byte, on 465; `smtp://` is upgraded with STARTTLS, on 587, and mail is never sent in the clear. Set both or neither. Without mail, notifications wait in the record rather than being lost, and the server says once each start how many are waiting.

## Forwarded email

A self-host has no mail server of its own for arriving mail, so a record's inbox takes mail forwarded to `/in/email/<token>` at your origin, where the token is the one `init` wrote to `inbound.token`. The token is read when the server starts.
