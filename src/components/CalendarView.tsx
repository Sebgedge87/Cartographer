import { schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { CalendarEditor } from './CalendarEditor';

/**
 * The world calendar, on its own. It used to be the third section of the schema
 * page, under two others — which is a fine place for it to live and a poor place
 * for it to be found.
 */
export function CalendarView() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  if (!projectId) return null;
  const schema = schemaFor(doc, projectId);

  return (
    <div className="schema">
      <div className="schema__inner">
        <section className="schema__section">
          <div className="schema__head">
            <span className="label">Calendar</span>
            <span className="schema__note">
              How a year works here — every date on every page is read against it
            </span>
          </div>
          <CalendarEditor projectId={projectId} calendar={schema.calendar} />
        </section>
      </div>
    </div>
  );
}
