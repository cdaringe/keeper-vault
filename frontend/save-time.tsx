import { Show } from 'solid-js';

export function SaveTime(props: { value?: string }) {
  return (
    <span class="save-time">
      <Show when={props.value} fallback="Save time not recorded">
        {(value) => (
          <>
            Saved on disk:{' '}
            <time datetime={value().replace(' ', 'T')}>{value()}</time> (local
            time)
          </>
        )}
      </Show>
    </span>
  );
}
