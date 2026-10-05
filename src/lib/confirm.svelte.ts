// The app's own confirmation card, in place of the browser's confirm(): one for the whole app
// (ConfirmDialog in the root layout), opened from anywhere with ask().
export type Ask = {
	message: string;
	/** The button that goes ahead, named for what it does: 消す, ブロック, 退会する */
	ok: string;
	/** Can't be taken back: the button is red */
	danger?: boolean;
};

type Open = Ask & { answer: (yes: boolean) => void };

class Confirmation {
	// Raw, so the one answering can be told apart from a newer one by identity
	current = $state.raw<Open | null>(null);

	ask(options: Ask): Promise<boolean> {
		// A second one replaces the first, which counts as cancelled
		this.current?.answer(false);
		return new Promise((resolve) => {
			const open: Open = {
				...options,
				answer: (yes) => {
					if (this.current === open) this.current = null;
					resolve(yes);
				}
			};
			this.current = open;
		});
	}
}

export const confirmation = new Confirmation();

export const ask = (options: Ask) => confirmation.ask(options);
