# Better Auth Beta Plugin

A flexible, secure, and extensible authentication plugin designed for beta access management. This plugin allows you to gate sign-ups behind beta codes, manage invite flows, and add custom fields or logic for your application's early access program.

---

## Features

- Restrict sign-up to users with valid beta codes or wildcard access
- Add and remove beta users via API endpoints
- Send custom invite links to users
- Support for additional fields in beta user schema
- Secure middleware to enforce beta access at sign-up
- Extensible with custom code generation and email logic
- Built on top of the [better-auth](https://npmjs.com/package/better-auth) ecosystem

---

## Installation

``npm install @studiisapp/beta``

---

## Usage

```
import { betaPlugin } from '@studiisapp/beta';

plugins: [
	betaPlugin({
		enabled: true,
		sendInviteLink: async ({ email, url, code }) => {
			await sendBetaInviteEmail({
				mailTo: email,
				betaKey: code,
				url,
			});
		},
		betaSecret: process.env.BETA_SECRET || "",
	}),
]
```

---

## Endpoints

| Endpoint                | Method | Description                                 |
|-------------------------|--------|---------------------------------------------|
| `/beta/add-user`        | POST   | Add a beta user or wildcard code            |
| `/beta/remove-user`     | DELETE | Remove a beta user (not yet implemented)    |
| `/beta/sign-up/:code`   | GET    | Callback for beta code sign-up              |
| `/beta/sign-up`         | POST   | Complete sign-up with beta code             |
| `/beta/check`           | GET    | Check if a beta code is valid               |

---

## How It Works

- **Beta Gating**: The plugin enforces beta access at the sign-up endpoint using a secret header (`X-Beta-Signup`). Only requests with the correct secret are allowed to proceed.
- **Invite Flow**: Admins can add users to the beta list, generating unique codes and sending invite links via email.
- **Wildcard Codes**: Supports "wildcard" codes for broader access (e.g., public beta).
- **Custom Fields**: Extend the beta user schema with additional fields as needed for your use case.
- **Secure Callbacks**: Redirects and error handling are built-in for a smooth user experience.

---

## Configuration Options

| Option             | Type       | Description                                      |
|--------------------|------------|--------------------------------------------------|
| `enabled`          | boolean    | Enable or disable the beta plugin                |
| `betaSecret`       | string     | Secret required in `X-Beta-Signup` header        |
| `sendInviteLink`   | function   | Custom function to send invite emails            |
| `additionalFields` | object     | Extra fields to add to the beta user schema      |
| `generateCode`     | function   | Custom function to generate invite codes         |
| `schema`           | object     | Custom schema overrides                          |

---

## Error Codes

- `USER_EXISTS`: User already exists in the beta
- `USER_NOT_FOUND`: User does not have beta access
- `INVALID_CODE`: Invalid or expired beta code

---

## Extending

You can customize invite links, code generation, and schema fields to fit your application's needs. See the `betaPlugin` options for details.

---

## License

MIT

---

## Contributing

Contributions and feedback are welcome! Please open issues or pull requests for improvements or bug fixes.

---

## Disclaimer

This plugin is designed for beta access use cases and should be integrated with proper security and validation according to your application's requirements.

---

For more details, see the source code and inline documentation.