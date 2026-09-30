import { describe, expect, it } from 'vitest';
import { deviceName } from './device';

describe('deviceName', () => {
	it('names the system and the browser', () => {
		expect(
			deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
		).toBe('iPhone・Safari');
		expect(
			deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36')
		).toBe('Android・Chrome');
		expect(
			deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0')
		).toBe('Windows・Edge');
		expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(
			'Mac・Safari'
		);
		expect(
			deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1')
		).toBe('iPhone・Chrome');
		expect(deviceName('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Linux・Firefox');
	});

	it('knows nothing without a user agent', () => {
		expect(deviceName(null)).toBeNull();
		expect(deviceName('')).toBeNull();
		expect(deviceName('curl/8.0')).toBeNull();
	});
});
