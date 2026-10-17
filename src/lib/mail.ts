// Between two mails to the same address (the server's MAIL_COOLDOWN_MS)
export const MAIL_COOLDOWN_SECONDS = 60;

/**
 * A mailto: link to one address with the subject filled in. The address is encoded too, so one
 * typed with ?, &, # or % in it (they pass the loose check on お問い合わせ) stays a single
 * address and can't add cc, bcc or a body. The @ is left as it is, where mailto allows it.
 */
export function mailtoHref(address: string, subject: string) {
	return `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}`;
}
