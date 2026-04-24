<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { _panel: !widgetProps.transparent }]" data-cy-mkw-calendar>
	<div :class="$style.head">
		<div :class="[$style.calendar, { [$style.isHoliday]: isHoliday }]">
			<p :class="$style.monthAndYear">
				<span :class="$style.year">{{ i18n.tsx.yearX({ year }) }}</span>
				<span :class="$style.month">{{ i18n.tsx.monthX({ month }) }}</span>
			</p>
			<p v-if="month === 1 && day === 1" class="day">🎉{{ i18n.tsx.dayX({ day }) }}<span style="display: inline-block; transform: scaleX(-1);">🎉</span></p>
			<p v-else :class="$style.day">{{ i18n.tsx.dayX({ day }) }}</p>
			<p :class="$style.weekDay">{{ weekDay }}</p>
		</div>
		<div :class="$style.info">
			<div :class="$style.infoSection">
				<p :class="$style.infoText">{{ i18n.ts.today }}<b :class="$style.percentage">{{ dayP.toFixed(1) }}%</b></p>
				<div :class="$style.meter">
					<div :class="$style.meterVal" :style="{ width: `${dayP}%` }"></div>
				</div>
			</div>
			<div :class="$style.infoSection">
				<p :class="$style.infoText">{{ i18n.ts.thisMonth }}<b :class="$style.percentage">{{ monthP.toFixed(1) }}%</b></p>
				<div :class="$style.meter">
					<div :class="$style.meterVal" :style="{ width: `${monthP}%` }"></div>
				</div>
			</div>
			<div :class="$style.infoSection">
				<p :class="$style.infoText">{{ i18n.ts.thisYear }}<b :class="$style.percentage">{{ yearP.toFixed(1) }}%</b></p>
				<div :class="$style.meter">
					<div :class="$style.meterVal" :style="{ width: `${yearP}%` }"></div>
				</div>
			</div>
		</div>
	</div>
	<div :class="$style.checkInPanel">
		<div :class="$style.checkInStats">
			<div :class="$style.statCard">
				<span :class="$style.statLabel">{{ i18n.ts.checkInCurrentStreak }}</span>
				<b :class="$style.statValue">{{ i18n.tsx.daysX({ n: checkInStatus?.currentStreak ?? 0 }) }}</b>
			</div>
			<div :class="$style.statCard">
				<span :class="$style.statLabel">{{ i18n.ts.checkInTotal }}</span>
				<b :class="$style.statValue">{{ i18n.tsx.daysX({ n: checkInStatus?.totalCheckIns ?? 0 }) }}</b>
			</div>
		</div>
		<button
			:class="[$style.checkInButton, { [$style.isCheckedIn]: checkInStatus?.isCheckedInToday }]"
			class="_button"
			:disabled="checkInSubmitting"
			@click="handleCheckIn"
		>
			<i :class="checkInStatus?.isCheckedInToday ? 'ti ti-rosette-discount-check' : 'ti ti-calendar-check'"></i>
			<span>{{ checkInStatus?.isCheckedInToday ? i18n.ts.checkedInToday : checkInSubmitting ? i18n.ts.checkInSubmitting : i18n.ts.checkInNow }}</span>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { useLowresTime, TIME_UPDATE_INTERVAL } from '@/composables/use-lowres-time.js';
import { pleaseLogin } from '@/utility/please-login.js';
import type { CheckInCalendar, CheckInStatus } from '@/utility/check-in.js';
import { fetchCheckInCalendar, fetchCheckInStatus, getCurrentCheckInMonth, submitCheckIn } from '@/utility/check-in.js';

const name = 'calendar';

const widgetPropsDef = {
	transparent: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.transparent,
		default: false,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const fNow = useLowresTime();
const year = ref(0);
const month = ref(0);
const day = ref(0);
const weekDay = ref('');
const yearP = ref(0);
const monthP = ref(0);
const dayP = ref(0);
const isHoliday = ref(false);
const checkInStatus = ref<CheckInStatus | null>(null);
const checkInCalendar = ref<CheckInCalendar | null>(null);
const checkInSubmitting = ref(false);

const nextDay = new Date();
nextDay.setHours(24, 0, 0, 0);
let nextDayMidnightTime = nextDay.getTime();
let nextDayTimer: number | null = null;

function update(time: number) {
	const now = new Date(time);
	const nd = now.getDate();
	const nm = now.getMonth();
	const ny = now.getFullYear();

	year.value = ny;
	month.value = nm + 1;
	day.value = nd;
	weekDay.value = [
		i18n.ts._weekday.sunday,
		i18n.ts._weekday.monday,
		i18n.ts._weekday.tuesday,
		i18n.ts._weekday.wednesday,
		i18n.ts._weekday.thursday,
		i18n.ts._weekday.friday,
		i18n.ts._weekday.saturday,
	][now.getDay()];

	const dayNumer = now.getTime() - new Date(ny, nm, nd).getTime();
	const dayDenom = 1000/*ms*/ * 60/*s*/ * 60/*m*/ * 24/*h*/;
	const monthNumer = now.getTime() - new Date(ny, nm, 1).getTime();
	const monthDenom = new Date(ny, nm + 1, 1).getTime() - new Date(ny, nm, 1).getTime();
	const yearNumer = now.getTime() - new Date(ny, 0, 1).getTime();
	const yearDenom = new Date(ny + 1, 0, 1).getTime() - new Date(ny, 0, 1).getTime();

	dayP.value = dayNumer / dayDenom * 100;
	monthP.value = monthNumer / monthDenom * 100;
	yearP.value = yearNumer / yearDenom * 100;

	isHoliday.value = now.getDay() === 0 || now.getDay() === 6;
}

watch(fNow, (to) => {
	update(to);

	// 次回更新までに日付が変わる場合、日付が変わった直後に強制的に更新するタイマーをセットする
	if (nextDayMidnightTime - to <= TIME_UPDATE_INTERVAL) {
		if (nextDayTimer != null) {
			window.clearTimeout(nextDayTimer);
			nextDayTimer = null;
		}

		nextDayTimer = window.setTimeout(() => {
			update(nextDayMidnightTime);
			nextDayTimer = null;
		}, nextDayMidnightTime - to);
	}
}, { immediate: true });

watch(day, () => {
	nextDay.setHours(24, 0, 0, 0);
	nextDayMidnightTime = nextDay.getTime();
});

async function refreshCheckIn() {
	const monthInfo = getCurrentCheckInMonth();
	const [status, calendar] = await Promise.all([
		fetchCheckInStatus(),
		fetchCheckInCalendar(monthInfo.year, monthInfo.month),
	]);

	checkInStatus.value = status;
	checkInCalendar.value = calendar;
}

async function openCalendarDialog() {
	if (checkInStatus.value == null || checkInCalendar.value == null) {
		await refreshCheckIn();
	}

	if (checkInStatus.value == null || checkInCalendar.value == null) return;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkCheckInCalendarDialog.vue')), {
		year: checkInCalendar.value.year,
		month: checkInCalendar.value.month,
		checkedDates: checkInCalendar.value.checkedDates,
		currentStreak: checkInStatus.value.currentStreak,
		totalCheckIns: checkInStatus.value.totalCheckIns,
		isCheckedInToday: checkInStatus.value.isCheckedInToday,
		serverDate: checkInStatus.value.serverDate,
	}, {
		closed: () => dispose(),
	});
}

async function handleCheckIn() {
	if (checkInSubmitting.value) return;

	if ($i == null) {
		const isLoggedIn = await pleaseLogin();
		if (!isLoggedIn) return;
	}

	checkInSubmitting.value = true;
	const wasCheckedIn = checkInStatus.value?.isCheckedInToday ?? false;

	try {
		checkInStatus.value = await submitCheckIn();

		const monthInfo = getCurrentCheckInMonth();
		checkInCalendar.value = await fetchCheckInCalendar(monthInfo.year, monthInfo.month);

		os.toast(wasCheckedIn ? i18n.ts.checkInAlreadyDone : i18n.ts.checkInSuccess);
		await openCalendarDialog();
	} finally {
		checkInSubmitting.value = false;
	}
}

void refreshCheckIn();

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: 16px;
}

.head {
	display: grid;
	grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
	gap: 8px;
	align-items: center;

	@media (max-width: 500px) {
		grid-template-columns: 1fr;
	}
}

.calendar {
	text-align: center;
	padding: 10px 8px;

	&.isHoliday {
		> .day {
			color: #ef95a0;
		}
	}
}

.monthAndYear,
.weekDay {
	margin: 0;
	line-height: 18px;
	font-size: 0.9em;
}

.year,
.month {
	margin: 0 4px;
}

.day {
	margin: 10px 0;
	line-height: 32px;
	font-size: 1.75em;
}

.info {
	padding: 6px 0 6px 12px;
	box-sizing: border-box;
}

.infoSection {
	margin-bottom: 8px;

	&:last-child {
		margin-bottom: 4px;
	}

	&:nth-child(1) {
		> .meter > .meterVal {
			background: #f7796c;
		}
	}

	&:nth-child(2) {
		> .meter > .meterVal {
			background: #a1de41;
		}
	}

	&:nth-child(3) {
		> .meter > .meterVal {
			background: #41ddde;
		}
	}
}

.infoText {
	display: flex;
	margin: 0 0 2px 0;
	font-size: 0.75em;
	line-height: 18px;
	opacity: 0.8;
}

.percentage {
	margin-left: auto;
}

.meter {
	width: 100%;
	overflow: hidden;
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.08);
	border-radius: 8px;
}

.meterVal {
	height: 4px;
	transition: width .3s cubic-bezier(0.23, 1, 0.32, 1);
}

.checkInPanel {
	margin-top: 14px;
	padding: 16px;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.92);
	border-radius: 18px;
}

.checkInStats {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;

	@media (max-width: 500px) {
		grid-template-columns: 1fr;
	}
}

.statCard {
	padding: 12px;
	border-radius: 14px;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.65);
}

.statLabel {
	display: block;
	margin-bottom: 8px;
	font-size: 0.75rem;
	opacity: 0.7;
}

.statValue {
	font-size: 0.98rem;
}

.checkInButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	margin-top: 14px;
	padding: 12px 14px;
	border-radius: 14px;
	font-weight: 700;
	color: #fff;
	background: linear-gradient(135deg, var(--MI_THEME-accent), color(from var(--MI_THEME-accent) srgb calc(r * 0.8) calc(g * 0.8) calc(b * 0.8)));
	box-shadow: 0 10px 24px color(from var(--MI_THEME-accent) srgb r g b / 0.28);

	&.isCheckedIn {
		color: var(--MI_THEME-accent);
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.13);
		box-shadow: none;
	}

	&:disabled {
		opacity: 0.8;
		cursor: default;
	}
}
</style>
