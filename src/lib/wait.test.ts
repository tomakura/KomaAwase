import { describe, expect, it } from 'vitest';
import { WAIT_DONE, WAIT_ID, leaveScript, stampHtml, themeOf, waitShell } from './wait';

// What a page from the server starts with
const page = (theme: string) => `<!doctype html>\n<html lang="ja" data-theme="${theme}">\n<head><meta charset="utf-8"></head><body></body></html>`;

describe('themeOf', () => {
	it('reads the theme a page was made with', () => {
		expect(themeOf(page('dark'))).toBe('dark');
		expect(themeOf(page('light'))).toBe('light');
		expect(themeOf(page('system'))).toBe('system');
	});

	it('is the device setting when a page says nothing, or something else', () => {
		expect(themeOf('')).toBe('system');
		expect(themeOf('<html lang="ja">')).toBe('system');
		expect(themeOf(page('sepia'))).toBe('system');
		// Only <html> counts, not text that looks like it further down
		expect(themeOf('<html lang="ja"><body data-theme="dark">')).toBe('system');
	});
});

describe('waitShell', () => {
	it('is a spinner over the whole screen, in a document that the page can follow', () => {
		const shell = waitShell('system');
		expect(shell.startsWith('<!doctype html><html lang="ja">')).toBe(true);
		expect(shell).toContain(`id="${WAIT_ID}"`);
		expect(shell).toContain('position:fixed;inset:0');
		expect(shell).toContain('role="status"');
		// It ends without closing anything: the page comes next in the same document
		expect(shell).not.toContain('</body>');
		expect(shell).not.toContain('</html>');
	});

	it('has the colors of the theme, or follows the device for the system theme', () => {
		expect(waitShell('dark')).toContain('#1c1a18');
		expect(waitShell('dark')).not.toContain('#f6f2ea');
		expect(waitShell('light')).toContain('#f6f2ea');
		expect(waitShell('light')).not.toContain('#1c1a18');
		expect(waitShell('light')).not.toContain('prefers-color-scheme');
		const system = waitShell('system');
		expect(system).toContain('#f6f2ea');
		expect(system).toContain('@media (prefers-color-scheme:dark)');
		expect(system).toContain('#1c1a18');
	});

	it('stops turning for people who ask for less motion, and is not left up for ever', () => {
		const shell = waitShell('system');
		expect(shell).toContain('prefers-reduced-motion:reduce');
		expect(shell).toContain('setTimeout');
	});
});

describe('WAIT_DONE', () => {
	it('takes the spinner away', () => {
		expect(WAIT_DONE).toContain(`getElementById("${WAIT_ID}")`);
		expect(WAIT_DONE).toContain('.remove()');
	});
});

describe('leaveScript', () => {
	it('goes to the address', () => {
		expect(leaveScript('https://koma.test/login')).toBe('<script>location.replace("https://koma.test/login")</script>');
	});

	it('cannot be broken out of by the address', () => {
		const script = leaveScript('https://koma.test/</script><script>alert(1)</script>');
		// One script: the only </script> is the last thing
		expect(script.indexOf('</script>')).toBe(script.length - '</script>'.length);
		expect(script).not.toContain('<script><');
	});
});

describe('stampHtml', () => {
	it('adds when the page was saved to <html>', () => {
		const stamped = stampHtml(page('dark'), '1790653329314');
		expect(stamped).toContain('<html data-cached-at="1790653329314" lang="ja" data-theme="dark">');
		expect(stamped.match(/<html/g)).toHaveLength(1);
	});

	it('leaves the page alone when the time is not a number', () => {
		expect(stampHtml(page('dark'), '"><script>')).toBe(page('dark'));
		expect(stampHtml(page('dark'), '')).toBe(page('dark'));
	});
});
