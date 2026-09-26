<script lang="ts">
  import { m } from "$lib/paraglide/messages";
</script>

<!-- Who made it, with a link to them. The site footer and the classroom screen both show it. -->
<p>
  {m.footer_made_before_heart()}<span aria-hidden="true">&#x2764;&#xfe0f;</span
  >{m.footer_made_before_name()}<a
    class="underline underline-offset-2"
    href="https://oseifert.ch"
    rel="noreferrer"
    target="_blank">Oliver</a
  >{m.footer_made_after_name()}
</p>
