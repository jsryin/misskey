<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="modal"
	:width="420"
	:height="560"
	@close="close"
	@closed="emit('closed')"
	@click="shake"
>
	<template #header>{{ i18n.ts.checkInCalendar }}</template>

	<div ref="rootEl" :class="$style.root">
		<div :class="$style.hero">
			<div :class="$style.heroMain">
				<p :class="$style.heroLabel">{{ isCheckedInToday ? i18n.ts.checkedInToday : i18n.ts.notCheckedInToday }}</p>
				<div :class="$style.heroTitleRow">
					<p :class="$style.heroTitle">
						<span>{{ i18n.tsx.yearX({ year }) }}</span>
						<span>{{ i18n.tsx.monthX({ month }) }}</span>
					</p>
					<div :class="$style.heroStats">
						<div :class="$style.inlineMetric">
							<span :class="$style.metricLabel">{{ i18n.ts.checkInCurrentStreak }}</span>
							<b :class="$style.metricValue">{{ i18n.tsx.daysX({ n: currentStreak }) }}</b>
						</div>
						<div :class="$style.inlineMetric">
							<span :class="$style.metricLabel">{{ i18n.ts.checkInTotal }}</span>
							<b :class="$style.metricValue">{{ i18n.tsx.daysX({ n: totalCheckIns }) }}</b>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div :class="$style.calendar">
			<div v-for="weekDay in weekDays" :key="weekDay" :class="$style.weekDay">{{ weekDay }}</div>
			<div
				v-for="cell in cells"
				:key="cell.key"
				:class="[
					$style.cell,
					{
						[$style.blank]: cell.day == null,
						[$style.checked]: cell.checked,
						[$style.today]: cell.today,
					},
				]"
			>
				<span v-if="cell.day != null">{{ cell.day }}</span>
				<i v-if="cell.checked" class="ti ti-check"></i>
			</div>
		</div>

	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	year: number;
	month: number;
	checkInDateUtc8: string[];
	currentStreak: number;
	totalCheckIns: number;
	isCheckedInToday: boolean;
	serverDate: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const rootEl = useTemplateRef('rootEl');

const checkedDaySet = computed(() => new Set(props.checkInDateUtc8.map(date => Number(date.split('-')[2]))));
const serverDay = computed(() => {
	const [year, month, day] = props.serverDate.split('-').map(Number);
	return { year, month, day };
});

const weekDays = computed(() => [
	i18n.ts._weekday.sunday,
	i18n.ts._weekday.monday,
	i18n.ts._weekday.tuesday,
	i18n.ts._weekday.wednesday,
	i18n.ts._weekday.thursday,
	i18n.ts._weekday.friday,
	i18n.ts._weekday.saturday,
]);

const cells = computed(() => {
	const firstDay = new Date(props.year, props.month - 1, 1).getDay();
	const daysInMonth = new Date(props.year, props.month, 0).getDate();
	const items: {
		key: string;
		day: number | null;
		checked: boolean;
		today: boolean;
	}[] = [];

	for (let i = 0; i < firstDay; i++) {
		items.push({
			key: `blank-${i}`,
			day: null,
			checked: false,
			today: false,
		});
	}

	for (let day = 1; day <= daysInMonth; day++) {
		items.push({
			key: `day-${day}`,
			day,
			checked: checkedDaySet.value.has(day),
			today: serverDay.value.year === props.year && serverDay.value.month === props.month && serverDay.value.day === day,
		});
	}

	return items;
});

function close() {
	modal.value?.close();
}

function shake() {
	rootEl.value?.animate([{
		offset: 0,
		transform: 'scale(1)',
	}, {
		offset: 0.5,
		transform: 'scale(1.01)',
	}, {
		offset: 1,
		transform: 'scale(1)',
	}], {
		duration: 120,
	});
}
</script>

<style lang="scss" module>
.root {
	padding: 20px;
	background: linear-gradient(180deg, color(from var(--MI_THEME-panel) srgb r g b / 0.95), var(--MI_THEME-bg));
	min-height: 100%;
	box-sizing: border-box;
}

.hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 18px;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.82);
	border: 1px solid color(from var(--MI_THEME-accent) srgb r g b / 0.15);
	border-radius: 20px;
	box-shadow: 0 12px 30px color(from var(--MI_THEME-shadow) srgb r g b / 0.08);
}

.heroMain {
	flex: 1;
	min-width: 0;
}

.heroTitleRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.heroLabel {
	margin: 0 0 6px;
	font-size: 0.78rem;
	color: var(--MI_THEME-accent);
}

.heroTitle {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 0;
	font-size: 1.25rem;
	font-weight: 700;
}

.heroStats {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.inlineMetric {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
}

.metricLabel {
	font-size: 0.75rem;
	opacity: 0.7;
}

.metricValue {
	font-size: 1rem;
}

.calendar {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 8px;
	margin-top: 18px;
}

.weekDay {
	text-align: center;
	font-size: 0.75rem;
	opacity: 0.7;
}

.cell {
	position: relative;
	aspect-ratio: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 16px;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.72);
	font-weight: 700;
	color: var(--MI_THEME-fg);

	> i {
		position: absolute;
		right: 8px;
		bottom: 6px;
		font-size: 0.75rem;
	}

	&.blank {
		background: transparent;
	}

	&.checked {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.18);
		color: var(--MI_THEME-accent);
	}

	&.today {
		box-shadow: inset 0 0 0 1px color(from var(--MI_THEME-accent) srgb r g b / 0.55);
	}
}

@container (max-width: 380px) {
	.hero {
		flex-direction: column;
		align-items: stretch;
	}

	.heroTitleRow {
		flex-direction: column;
		align-items: flex-start;
	}

	.heroStats {
		width: 100%;
	}
}
</style>
