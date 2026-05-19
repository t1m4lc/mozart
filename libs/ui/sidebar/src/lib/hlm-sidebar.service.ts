import {
	computed,
	DOCUMENT,
	inject,
	Injectable,
	type Signal,
	signal,
} from '@angular/core';
import { injectHlmSidebarConfig } from './hlm-sidebar.token';

export type SidebarVariant = 'sidebar' | 'floating' | 'inset';

@Injectable({ providedIn: 'root' })
export class HlmSidebarService {
	private readonly _config = injectHlmSidebarConfig();
	private readonly _document = inject(DOCUMENT);
	private readonly _open = signal<boolean>(true);
	// Desktop-only app: mobile mode, the matchMedia listener, the
	// window resize listener, and the Ctrl/Cmd+B keyboard shortcut
	// listener were removed. These two signals stay so the other
	// sidebar primitives keep compiling, but they never flip — every
	// render is the desktop path.
	private readonly _openMobile = signal<boolean>(false);
	private readonly _isMobile = signal<boolean>(false);
	private readonly _variant = signal<SidebarVariant>('sidebar');

	public readonly open: Signal<boolean> = this._open.asReadonly();
	public readonly openMobile: Signal<boolean> = this._openMobile.asReadonly();
	public readonly isMobile: Signal<boolean> = this._isMobile.asReadonly();
	public readonly variant: Signal<SidebarVariant> = this._variant.asReadonly();

	public readonly state = computed<'expanded' | 'collapsed'>(() => (this._open() ? 'expanded' : 'collapsed'));

	constructor() {
		// Restore the persisted open state from the cookie. Synchronous —
		// `document` is always available at construction in a Tauri app.
		const cookie = this._document.cookie
			.split('; ')
			.find((row) => row.startsWith(`${this._config.sidebarCookieName}=`));
		if (cookie) {
			const value = cookie.split('=')[1];
			this._open.set(value === 'true');
		}
	}

	public setOpen(open: boolean): void {
		this._open.set(open);
		this._document.cookie = `${this._config.sidebarCookieName}=${open}; path=/; max-age=${this._config.sidebarCookieMaxAge}`;
	}

	public setOpenMobile(open: boolean): void {
		if (this._isMobile()) {
			this._openMobile.set(open);
		}
	}

	public setVariant(variant: SidebarVariant): void {
		this._variant.set(variant);
	}

	public toggleSidebar(): void {
		this.setOpen(!this._open());
	}
}
